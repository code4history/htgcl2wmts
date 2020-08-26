const { createCanvas, loadImage } = require('canvas');
const Tin = require('@maplat/tin');
const fs = require('fs-extra');

//=== Temp test data ===
const imagePath = 'C:\\Users\\10467\\OneDrive\\MaplatEditor\\originals\\naramachi_yasui_bunko.jpg';
const htgclData = require('C:\\Users\\10467\\OneDrive\\MaplatEditor\\compiled\\naramachi_yasui_bunko.json');
const tileRoot = 'C:\\Users\\10467\\OneDrive\\MaplatEditor\\wmts';
const mapID = 'naramachi_2';

const width = htgclData.width;
const height = htgclData.height;
const compiled = htgclData.compiled;
const MAX_MERC = 20037508.342789244;

work();

async function work() {
    const tin = new Tin({
        wh: [width, height],
        stateFull: true
    });
    tin.setCompiled(compiled);

    const lt = tin.transform([0, 0], false, true);
    const rt = tin.transform([width, 0], false, true);
    const rb = tin.transform([width, height], false, true);
    const lb = tin.transform([0, height], false, true);

    const pixelLongest = Math.sqrt(Math.pow(width, 2) + Math.pow(height, 2));
    const ltrbLong = Math.sqrt(Math.pow(lt[0] - rb[0], 2) + Math.pow(lt[1] - rb[1], 2));
    const rtlbLong = Math.sqrt(Math.pow(rt[0] - lb[0], 2) + Math.pow(rt[1] - lb[1], 2));

    const wwRate = MAX_MERC * 2 / 256;
    const mapRate = Math.min(ltrbLong / pixelLongest, rtlbLong / pixelLongest);
    const maxZoom = Math.ceil(Math.log2(wwRate / mapRate));
    const minSide = Math.min(width, height);
    const deltaZoom = Math.ceil(Math.log2(minSide / 256));
    const minZoom = maxZoom - deltaZoom;

    const pixelXw = (Math.min(lt[0], rt[0], lb[0], rb[0]) + MAX_MERC) / (2 * MAX_MERC) * 256 * Math.pow(2, maxZoom);
    const pixelXe = (Math.max(lt[0], rt[0], lb[0], rb[0]) + MAX_MERC) / (2 * MAX_MERC) * 256 * Math.pow(2, maxZoom);
    const pixelYn = (MAX_MERC - Math.max(lt[1], rt[1], lb[1], rb[1])) / (2 * MAX_MERC) * 256 * Math.pow(2, maxZoom);
    const pixelYs = (MAX_MERC - Math.min(lt[1], rt[1], lb[1], rb[1])) / (2 * MAX_MERC) * 256 * Math.pow(2, maxZoom);

    const tileXw = Math.floor(pixelXw / 256);
    const tileXe = Math.floor(pixelXe / 256);
    const tileYn = Math.floor(pixelYn / 256);
    const tileYs = Math.floor(pixelYs / 256);
    const tileXY = [tileXw, tileXe, tileYn, tileYs];

    await handleMaxZoom(tin, imagePath, maxZoom, [width, height], tileXY, tileRoot, mapID);

    await createNextZoom(maxZoom, minZoom, tileXY, tileRoot, mapID);
}

async function createNextZoom(upZoom, minZoom, upTileXY, tileRoot, mapID) {
    const downZoom = upZoom - 1;
    const downTileXY = [
        Math.floor(upTileXY[0] / 2),
        Math.floor(upTileXY[1] / 2),
        Math.floor(upTileXY[2] / 2),
        Math.floor(upTileXY[3] / 2)
    ];

    for (let tx = downTileXY[0]; tx <= downTileXY[1]; tx++) {
        const tileFolder = `${tileRoot}\\${mapID}\\${downZoom}\\${tx}`;
        await fs.ensureDir(tileFolder);
        for (let ty = downTileXY[2]; ty <= downTileXY[3];ty++) {
            const tileFile = `${tileFolder}\\${ty}.png`;
            const tileCanvas = createCanvas(256, 256);
            const tileCtx = tileCanvas.getContext('2d');
            const tileImgData = tileCtx.getImageData(0, 0, 256, 256);
            tileImgData.data = tileImgData.data.map(() => 0);
            tileCtx.putImageData(tileImgData, 0, 0);

            for (let dx = 0; dx < 2; dx++) {
                const ux = tx * 2 + dx;
                if (ux < upTileXY[0] || ux > upTileXY[1]) continue;
                const ox = dx * 128;
                for (let dy = 0; dy < 2; dy ++) {
                    const uy = ty * 2 + dy;
                    if (uy < upTileXY[2] || uy > upTileXY[3]) continue;
                    const oy = dy * 128;
                    const upImage = `${tileRoot}\\${mapID}\\${upZoom}\\${ux}\\${uy}.png`;
                    const image = await loadImage(upImage);
                    tileCtx.drawImage(image, ox, oy, 128, 128);
                }
            }

            const pngTile = tileCanvas.toBuffer('image/png');
            await fs.outputFile(tileFile, pngTile);
        }
    }

    if (downZoom == minZoom) return;
    return await createNextZoom(downZoom, minZoom, downTileXY, tileRoot, mapID);
}

async function handleMaxZoom(tin, imagePath, z, wh, tileXY, tileRoot, mapID) {
    const canvas = createCanvas(wh[0], wh[1]);
    const ctx = canvas.getContext('2d');

    const image = await loadImage(imagePath);
    ctx.drawImage(image, 0, 0);
    const imgData = ctx.getImageData(0, 0, wh[0], wh[1]);
    const imageBuffer = imgData.data;
    const tileMapRoot = `${tileRoot}\\${mapID}\\${z}`;

    for (let tx = tileXY[0];tx <= tileXY[1]; tx++) {
        for (let ty = tileXY[2];ty <= tileXY[3]; ty++) {
            await localTileLoop(tin, z, [tx, ty], imageBuffer, wh, tileMapRoot);
        }
    }

}

async function localTileLoop(tin, z, txy, imageBuffer, wh, tileMapRoot) {
    const unitPerPixel = (2 * MAX_MERC) / (256 * Math.pow(2, z));
    const startPixelX = txy[0] * 256;
    const startPixelY = txy[1] * 256;

    const tileCanvas = createCanvas(256, 256);
    const tileCtx = tileCanvas.getContext('2d');
    const tileImgData = tileCtx.getImageData(0, 0, 256, 256);
    const tileData = tileImgData.data;

    const range = [-1, 0, 1, 2];
    let pos = 0;

    for (let py = 0; py < 256; py++) {
        const my = MAX_MERC - ((py + startPixelY) * unitPerPixel);
        for (let px = 0; px < 256; px++) {
            const mx = (px + startPixelX) * unitPerPixel - MAX_MERC;
            const xy = tin.transform([mx, my], true, true);
            const rangeX = range.map(i => i + ~~xy[0]);
            const rangeY = range.map(i => i + ~~xy[1]);

            let r = 0, g = 0, b = 0, a = 0;
            for (const y of rangeY) {
                const weightY = getWeight(y, xy[1]);
                for (const x of rangeX) {
                    const weight = weightY * getWeight(x, xy[0]);
                    if (weight === 0) {
                        continue;
                    }

                    const color = rgba(imageBuffer, wh[0], wh[1], x, y);
                    r += color.r * weight;
                    g += color.g * weight;
                    b += color.b * weight;
                    a += color.a * weight;
                }
            }

            tileData[pos] = ~~r;
            tileData[pos+1] = ~~g;
            tileData[pos+2] = ~~b;
            tileData[pos+3] = ~~a;
            pos = pos + 4;
        }
    }

    tileCtx.putImageData(tileImgData, 0, 0);
    const pngTile = tileCanvas.toBuffer('image/png');

    const tileFolder = `${tileMapRoot}\\${txy[0]}`;
    const tileFile = `${tileFolder}\\${txy[1]}.png`;
    await fs.ensureDir(tileFolder);
    await fs.outputFile(tileFile, pngTile);
}

function rgba(pixels, w, h, x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) {
        return {r: 0, g: 0, b: 0, a: 0};
    }
    const p = ((w * y) + x) * 4;
    const ret = { r: pixels[p], g: pixels[p+1], b: pixels[p+2], a: pixels[p+3]};
    return ret;
}

function getWeight(t1,  t2) {
    const a = -1;
    const d = Math.abs(t1 - t2);
    if (d < 1) {
        return (a + 2) * Math.pow(d, 3) - (a + 3) * Math.pow(d, 2) + 1;
    } else if (d < 2) {
        return a * Math.pow(d, 3) - 5 * a * Math.pow(d, 2) + 8 * a * d - 4 * a;
    } else {
        return 0;
    }
}