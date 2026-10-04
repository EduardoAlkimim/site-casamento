// Reduz a foto no próprio celular antes de enviar: arquivo leve para a VM
// e para quem abre o site no 4G. Saída em WebP, lado maior com até 1400px.
export async function resizeImage(file: File, maxSide = 1400, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Não foi possível ler a foto.'))), 'image/webp', quality),
  )
}
