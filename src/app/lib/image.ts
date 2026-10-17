/* =============================================================================
 * 薄肌计划 · 图片压缩（体检报告上传）
 *
 * 相机 / 相册原图动辄数 MB，直接送模型太慢也容易超限：统一压到长边 1600px 的 JPEG
 * （质量 0.85）再转 dataURL。两条来路：
 *   1. <input type="file"> 的 File 对象；
 *   2. 壳 chooseImage 返回的虚拟 URL（https://<页面主机>/media/…，同源可画进 canvas）。
 * ========================================================================== */

const MAX_EDGE = 1600
const QUALITY = 0.85

function drawToDataUrl(img: HTMLImageElement): string {
  let w = img.naturalWidth
  let h = img.naturalHeight
  if (w > MAX_EDGE || h > MAX_EDGE) {
    const r = Math.min(MAX_EDGE / w, MAX_EDGE / h)
    w = Math.round(w * r)
    h = Math.round(h * r)
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画布不可用')
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', QUALITY)
}

/** File（相册 / 拍照输入框）→ 压缩后的 JPEG dataURL */
export function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        try {
          resolve(drawToDataUrl(img))
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
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        resolve(drawToDataUrl(img))
      } catch (err) {
        reject(err instanceof Error ? err : new Error('图片处理失败'))
      }
    }
    img.onerror = () => reject(new Error('图片加载失败，请重试'))
    img.src = url
  })
}
