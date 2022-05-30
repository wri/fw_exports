const { parse } = require("json2csv");
const fs = require('fs')
const archiver = require('archiver')
const { ObjectId } = require("mongoose").Types;
import axios from "axios";
const streamBuffers = require("stream-buffers")

class FileService {
    static async createCsv(payload, fields, template) {
        // fields is an array of accepted fields
        // payload is an array of objects

        return new Promise(async (resolve, reject) => {

            var myWritableStreamBuffer = new streamBuffers.WritableStreamBuffer({
                initialSize: (100 * 1024),   // start at 100 kilobytes.
                incrementAmount: (10 * 1024) // grow by 10 kilobytes each time buffer overflows.
            });

            const archive = archiver('zip');

            archive.on('error', function (err) {
                throw err;
            });
            archive.pipe(myWritableStreamBuffer)

            myWritableStreamBuffer.on('finish', () => {
                const contents = myWritableStreamBuffer.getContents()
                console.log(contents)
                resolve(contents);
            });
            myWritableStreamBuffer.on('error', reject);

            // flatten object
            for await (const record of payload) {
                for (const property in record.attributes) {
                    record[property] = record.attributes[property];
                }

                if (fields.includes("questions")) { // make fields for each question
                    for await (const question of template.attributes.questions) {
                        const questionLabel = question.label[record.attributes.language]
                        const questionAnswer = record.responses.find(response => response.name === question.name)
                        // check if the answer is an image
                        if (questionAnswer.value && questionAnswer.value.startsWith("https://s3.amazonaws.com")) {
                        // download the image
                            const image = await axios({
                                url: questionAnswer.value,
                                responseType: "stream",
                                responseEncoding: "utf-8"
                            });
                            // save it to the directory - directory name should be name of report/name of question
                            const imagePath = `${record.attributes.reportName}/${question.name}/attachment.jpeg`
                            console.log(image.data)
                            archive.append(image.data, { name: imagePath })
                            // add the path to the csv file
                            record[questionLabel] = imagePath
                        } else record[questionLabel] = questionAnswer.value
                        fields.push(questionLabel)
                    }
                }
            };

            fields.splice(fields.indexOf("questions"), 1)
            const opts = { fields };
            const csv = parse(payload, opts);
            archive.append(csv, { name: 'reportAnswers.csv' });
            archive.finalize();

        });
    }

    static createBundle(payload, fields) {
        return null;
    }
}

module.exports = FileService;
