import { describe, expect, it } from "vitest";
import { encodeIco } from "./ico";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Something that starts like a PNG and is `length` bytes long, filled with `fill`. */
function fakePng(length: number, fill: number): Uint8Array {
  const data = new Uint8Array(length).fill(fill);
  data.set(SIGNATURE);
  return data;
}

const view = (file: Uint8Array): DataView => new DataView(file.buffer, file.byteOffset, file.byteLength);

describe("encodeIco", () => {
  it("writes the header of an icon file with the number of images", () => {
    const file = encodeIco([
      { size: 16, png: fakePng(20, 1) },
      { size: 32, png: fakePng(30, 2) },
    ]);
    expect(view(file).getUint16(0, true)).toBe(0);
    expect(view(file).getUint16(2, true)).toBe(1);
    expect(view(file).getUint16(4, true)).toBe(2);
    expect(file.length).toBe(6 + 2 * 16 + 20 + 30);
  });

  it("describes each image and points at where its bytes start", () => {
    const first = fakePng(20, 1);
    const second = fakePng(30, 2);
    const file = encodeIco([
      { size: 16, png: first },
      { size: 48, png: second },
    ]);
    const data = view(file);

    expect(data.getUint8(6)).toBe(16);
    expect(data.getUint8(7)).toBe(16);
    expect(data.getUint16(6 + 4, true)).toBe(1);
    expect(data.getUint16(6 + 6, true)).toBe(32);
    expect(data.getUint32(6 + 8, true)).toBe(20);
    expect(data.getUint32(6 + 12, true)).toBe(38);

    expect(data.getUint8(22)).toBe(48);
    expect(data.getUint32(22 + 8, true)).toBe(30);
    expect(data.getUint32(22 + 12, true)).toBe(58);

    expect(Array.from(file.subarray(38, 58))).toEqual(Array.from(first));
    expect(Array.from(file.subarray(58, 88))).toEqual(Array.from(second));
  });

  it("stores 256 pixels as 0, as the format requires", () => {
    const file = encodeIco([{ size: 256, png: fakePng(12, 0) }]);
    expect(view(file).getUint8(6)).toBe(0);
    expect(view(file).getUint8(7)).toBe(0);
  });

  it("does not modify the images it is given", () => {
    const png = fakePng(16, 7);
    const copy = Uint8Array.from(png);
    encodeIco([{ size: 16, png }]);
    expect(png).toEqual(copy);
  });

  it("rejects an empty list", () => {
    expect(() => encodeIco([])).toThrow(RangeError);
  });

  it.each([0, -16, 257, 16.5, Number.NaN])("rejects the size %s", (size) => {
    expect(() => encodeIco([{ size, png: fakePng(12, 0) }])).toThrow(RangeError);
  });

  it("rejects data that is not a PNG", () => {
    expect(() => encodeIco([{ size: 16, png: new Uint8Array(32) }])).toThrow(/not a PNG/);
    expect(() => encodeIco([{ size: 16, png: Uint8Array.from(SIGNATURE) }])).toThrow(RangeError);
    expect(() => encodeIco([{ size: 16, png: new Uint8Array(0) }])).toThrow(RangeError);
  });
});
