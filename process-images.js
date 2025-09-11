const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const inputDir = "./images/work/DigitalMedia";
const outputDir = "./images/work/Protected";
const watermarkPath = "./logo.png";

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

fs.readdirSync(inputDir).forEach(async (file) => {
  const ext = path.extname(file).toLowerCase();
  if ([".jpg", ".jpeg", ".png"].includes(ext)) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file);

    try {
      // Get input image metadata
      const image = sharp(inputPath);
      const metadata = await image.metadata();

      // Resize watermark to 20% of image width
      const watermarkResized = await sharp(watermarkPath)
        .resize({ width: Math.floor(metadata.width * 0.2) })
        .png()
        .toBuffer();

      await image
        .resize({ width: 1200 }) // Optional: resize main image
        .composite([
          {
            input: watermarkResized,
            gravity: "southeast",
            blend: "overlay",
            opacity: 0.3,
          },
        ])
        .toFormat(ext === ".png" ? "png" : "jpeg", { quality: 80 })
        .toFile(outputPath);

      console.log(`Protected: ${file}`);
    } catch (err) {
      console.error(`Error: ${file}`, err);
    }
  }
});