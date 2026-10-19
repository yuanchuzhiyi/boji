/* =============================================================================
 * 薄肌计划 · 图片压缩（对话图片输入 / 体检报告上传）
 *
 * 相机 / 相册原图动辄数 MB，直接送模型太慢也容易超限。两条来路：
 *   1. <input type="file"> 的 File 对象；
 *   2. 壳 chooseImage 返回的虚拟 URL（https://<页面主机>/media/…，同源可画进 canvas）。
 *
 * 两档输出：
 *   - full：长边 1600px JPEG（q 0.85）——送给模型的多模态消息用；
 *   - thumb：长边 240px JPEG（q 0.6）——对话历史入库用（一张约 15–25KB，
 *     避免原图 dataURL 撑爆 localStorage 配额；历史上下文也只带文字，不带图）。
 * ========================================================================== */

const MAX_EDGE_FULL = 1600
const QUALITY_FULL = 0.85
const MAX_EDGE_THUMB = 240
const QUALITY_THUMB = 0.6

function drawToDataUrl(img: HTMLImageElement, maxEdge: number, quality: number): string {
  let w = img.naturalWidth
  let h = img.naturalHeight
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
  return canvas.toDataURL('image/jpeg', quality)
}

/** File（相册 / 拍照输入框）→ 压缩后的 JPEG dataURL */
export function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        try {
          resolve(drawToDataUrl(img, MAX_EDGE_FULL, QUALITY_FULL))
        } catch (err) {
          reject(err instanceof Error ? err : new Error('图片处理失败'))
        }
      }
      img.onerror = () => resolve(String(reader.result ?? ''))
      img.src = String(reader.result ?? '')
    }
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

/** 虚拟 URL（壳 chooseImage 的返回值）→ 压缩后的 JPEG dataURL */
export function urlToCompressedDataUrl(url: string): Promise<string> {
  return loadImage(url).then((img) => drawToDataUrl(img, MAX_EDGE_FULL, QUALITY_FULL))
}

/** 虚拟 URL → 全清图 + 缩略图两档（一次加载画两次，对话图片输入用） */
export async function urlToBothDataUrls(url: string): Promise<{ full: string; thumb: string }> {
  const img = await loadImage(url)
  return {
    full: drawToDataUrl(img, MAX_EDGE_FULL, QUALITY_FULL),
    thumb: drawToDataUrl(img, MAX_EDGE_THUMB, QUALITY_THUMB),
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败，请重试'))
    img.src = url
  })
}
