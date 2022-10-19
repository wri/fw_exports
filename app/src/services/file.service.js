const archiver = require("archiver");
const PDFDocument = require("pdfkit");
const streamBuffers = require("stream-buffers");

export class FileService {
  /**
   * Creates an archive of given files
   * @param {{data: (String | Buffer | Stream), name: String}[]} sources A list of files that will go into the archive
   * @returns {Promise<Buffer>} A buffer which contains the archive data
   * @throws Any errors thrown by failure to archive
   */
  static async createArchive(sources) {
    const archive = archiver("zip");
    const writeStreamBuffer = new streamBuffers.WritableStreamBuffer();

    archive.pipe(writeStreamBuffer);
    archive.on("error", error => {
      throw error;
    });

    for (const source of sources) {
      archive.append(source.data, { name: source.name });
    }

    archive.finalize();

    return new Promise((resolve, reject) => {
      writeStreamBuffer.on("finish", () => {
        resolve(writeStreamBuffer.getContents());
      });
      writeStreamBuffer.on("error", reject);
    });
  }

  /**
   * Creates a pdf of images
   * @param {String} documentName Name of the output document
   * @param {{data: String | Buffer, fit?: [width, height]}[]} images A list of images with any fitting parameters for size
   * @returns {Promise<Buffer>} A buffer of the pdf data
   * @throws Any errors that arise while creating a PDF document
   */
  static async createImagesPDF(documentName, images) {
    const doc = new PDFDocument({ displayTitle: documentName });
    const writeStreamBuffer = new streamBuffers.WritableStreamBuffer();

    doc.pipe(writeStreamBuffer);

    for (const image in images) {
      doc.image(image.data, { fit: [100, 100] });
    }

    doc.end();

    return new Promise((resolve, reject) => {
      writeStreamBuffer.on("finish", () => {
        resolve(writeStreamBuffer.getContents());
      });
      writeStreamBuffer.on("error", reject);
    });
  }
}
