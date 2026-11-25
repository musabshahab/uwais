/**
 * Minimal ICO writer for `favicon.ico`.
 *
 * An ICO file is a small directory followed by the images it lists. Since
 * Windows Vista (and in every browser) each image may simply be a PNG file,
 * so no bitmap conversion is needed: this packs ready-made PNGs. It is pure
 * (no Node APIs) and is used by `scripts/generate-icons.ts`.
 */

/** One image of an ICO file. */
export interface IcoImage {
  /** Width and height in pixels, 1 to 256. */
  readonly size: number;
  /** The image as a complete PNG file. */
  readonly png: Uint8Array;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const HEADER_BYTES = 6;
const ENTRY_BYTES = 16;
const MAX_SIZE = 256;

function isPng(data: Uint8Array): boolean {
  return data.length > PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => data[index] === byte);
}

/**
 * Packs PNG images into one ICO file, in the order given (list the smallest
 * first: some readers pick the first entry).
 * @throws RangeError when there are no images, a size is not an integer from 1 to 256, or the data is not a PNG.
 */
export function encodeIco(images: readonly IcoImage[]): Uint8Array {
  if (images.length === 0) throw new RangeError("An ICO file needs at least one image");
  if (images.length > 0xffff) throw new RangeError("Too many images for one ICO file");
  for (const { size, png } of images) {
    if (!Number.isInteger(size) || size < 1 || size > MAX_SIZE) {
      throw new RangeError(`ICO image size must be an integer from 1 to ${MAX_SIZE}, got ${size}`);
    }
    if (!isPng(png)) throw new RangeError(`The ${size}px image is not a PNG file`);
  }

  const directoryBytes = HEADER_BYTES + ENTRY_BYTES * images.length;
  const totalBytes = images.reduce((total, image) => total + image.png.length, directoryBytes);
  const file = new Uint8Array(totalBytes);
  const view = new DataView(file.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, images.length, true);

  let offset = directoryBytes;
  images.forEach(({ size, png }, index) => {
    const entry = HEADER_BYTES + ENTRY_BYTES * index;
    // One byte each for width and height, where 0 stands for 256.
    view.setUint8(entry, size === MAX_SIZE ? 0 : size);
    view.setUint8(entry + 1, size === MAX_SIZE ? 0 : size);
    view.setUint8(entry + 2, 0); // palette size: none
    view.setUint8(entry + 3, 0); // reserved
    view.setUint16(entry + 4, 1, true); // colour planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, png.length, true);
    view.setUint32(entry + 12, offset, true);
    file.set(png, offset);
    offset += png.length;
  });

  return file;
}
