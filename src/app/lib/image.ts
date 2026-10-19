/* =============================================================================
 * 薄肌计划 · 图片压缩（对话图片输入 / 体检报告上传）
 *
 * 输入来源：
 *   1. 壳 chooseImage 返回的虚拟 URL（https://<页面主机>/media/…）；
 *   2. <input type="file"> 的 File 对象。
 *
 * 两条处理路线（真机 WebView 上必须双保险）：
 *   A. canvas 压缩（首选，体积小）：长边 1600px 全清图 + 240px 缩略图；
 *   B. 原始字节兜底：WebView 里虚拟 URL 画进 canvas 可能因画布污染
 *      （toDataURL 抛 SecurityError）或 HEIC 等格式解码失败而失败，
 *      此时直接 fetch 字节 → FileReader 转 dataURL，不经过 canvas。
 *      缩略图退回全图（存储层有配额保护，会优先剥掉最早的图片）。
 *
 * 体积约定：full 送模型（多模态 image_url）；thumb 入对话历史（localStorage）。
 * ========================================================================== */

const MAX_EDGE_FULL = 1600
const QUALITY_FULL = 0.85
const MAX_EDGE_THUMB = 240
const QUALITY_THUMB = 0.6

/** 原始字节上限（兜底路线）：超过 8MB 的图片直接拒绝，避免请求体过大 */
const MAX_RAW_BYTES = 8 * 1024 * 1024

export interface PreparedImage {
  /** 送模型的全清图（JPEG dataURL） */
  full: string
  /** 入对话历史的缩略图（JPEG dataURL；兜底时等于 full） */
  thumb: string
}

function drawToDataUrl(img: HTMLImageElement, maxEdge: number, quality: number): string {
  let w = img.naturalWidth
  let h = img.naturalHeight
  if (!w || !h) throw new Error('图片解码失败')
  if (w > maxEdge || h > maxEdge) {
    const r = Math.min(maxEdge / w, maxEdge / h)
    w = Math.round(w * r)
    h = Math.round(h * r)
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画布不可用')
  ctx.drawImage(img, 0, 0, w, h)
  // 画布被污染时这里会抛 SecurityError —— 由调用方走原始字节兜底
  return canvas.toDataURL('image/jpeg', quality)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

/** 兜底路线：直接读原始字节转 dataURL（不经 canvas） */
async function readRawDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`图片读取失败（HTTP ${res.status}）`)
  const blob = await res.blob()
  if (!blob.size) throw new Error('图片为空，请重新选择')
  if (blob.size > MAX_RAW_BYTES) throw new Error('图片过大（超过 8MB），请换一张')
  const mime = blob.type || ''
  if (mime && !/^image\/(jpeg|jpg|png|webp|gif|bmp)$/i.test(mime)) {
    // HEIC 等 WebView 不支持解码、模型也不接受的格式
    throw new Error(`这张图片格式（${mime}）暂不支持，请转存为 JPEG 后重试`)
  }
  return readBlobAsDataUrl(blob)
}

/**
 * 壳 chooseImage 的虚拟 URL → 全清图 + 缩略图。
 * 先尝试 canvas 压缩；失败（画布污染 / 格式不支持解码）时退回原始字节。
 */
export async function urlToBothDataUrls(url: string): Promise<PreparedImage> {
  let canvasError: unknown
  try {
    const img = await loadImage(url)
    return {
      full: drawToDataUrl(img, MAX_EDGE_FULL, QUALITY_FULL),
      thumb: drawToDataUrl(img, MAX_EDGE_THUMB, QUALITY_THUMB),
    }
  } catch (err) {
    canvasError = err
  }
  try {
    const full = await readRawDataUrl(url)
    return { full, thumb: full }
  } catch (rawErr) {
    // 两条路线都失败：把 canvas 侧的信息带出来，便于用户判断（多半是格式问题）
    const detail = (rawErr as Error).message
    const mine = (canvasError as Error | undefined)?.message
    throw new Error(mine && mine !== '图片加载失败' ? `${detail}（${mine}）` : detail)
  }
}

/** 虚拟 URL → 单张压缩图（体检报告上传用；同样带回退） */
export async function urlToCompressedDataUrl(url: string): Promise<string> {
  return (await urlToBothDataUrls(url)).full
}

/** File（<input type="file">）→ 压缩后的 JPEG dataURL */
export function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        try {
          resolve(drawToDataUrl(img, MAX_EDGE_FULL, QUALITY_FULL))
        } catch {
          // 画布不可用时退回原始 dataURL（FileReader 已读成 dataURL）
          resolve(String(reader.result ?? ''))
        }
      }
      img.onerror = () => resolve(String(reader.result ?? ''))
      img.src = String(reader.result ?? '')
    }
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}
