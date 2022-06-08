const { parse } = require("json2csv");
const archiver = require("archiver");
import axios from "axios";
const streamBuffers = require("stream-buffers");

class FileService {
  static async createCsv(payload, fields, template, language) {
    // fields is an array of accepted fields
    // payload is an array of objects

    var myWritableStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 10 * 1024 // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip");

    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(myWritableStreamBuffer);

    // create array of questions
    let questions = [...template.attributes.questions];

    // flatten object
    for await (const record of payload) {
      for (const property in record.attributes) {
        record[property] = record.attributes[property];
      }

      if (fields.includes("responses")) {
        // loop over responses
        for await (const response of record.responses) {
          // find the question in questions, if not found, add
          let question = questions.find(question => question.name === response.name);
          if (!question) {
            question = { name: response.name, label: { [language]: response.name } };
            questions.push(question);
          }
          // check if the answer is an image
          if (response.value && response.value.startsWith("https://s3.amazonaws.com")) {
            // download the image
            const image = await axios({
              url: response.value,
              responseType: "stream",
              responseEncoding: "utf-8"
            });
            // save it to the directory - directory name should be name of report/name of question
            const imagePath = `${record.attributes.reportName}/${response.name}/attachment.jpeg`;
            archive.append(image.data, { name: imagePath });
            // add the path to the csv file
            record[question.label[language]] = imagePath;
          } else record[question.label[language]] = response.value;
        }
      }
    }

    // remove "questions" from
    if (fields.includes("responses")) {
      fields.splice(fields.indexOf("responses"), 1);
      fields.push(...questions.map(question => question.label[language]));
    }
    const opts = { fields };
    const csv = parse(payload, opts);
    archive.append(csv, { name: "reportAnswers.csv" });
    archive.finalize();

    return new Promise((resolve, reject) => {
      myWritableStreamBuffer.on("finish", () => {
        const contents = myWritableStreamBuffer.getContents();
        resolve(contents);
      });
      myWritableStreamBuffer.on("error", reject);
    });
  }

  static async createBundle(payload, template) {
    // create a fwbundle
    let bundle = {
      version: 2,
      timestamp: new Date().getTime(),
      alerts: [],
      areas: [],
      basemaps: [],
      layers: [],
      routes: [],
      templates: {}, // has the data for the templates
      reports: [], // has the data for the reports,
      manifest: {
        layerFiles: [],
        reportFiles: [] // has the data for report files
      }
    };

    var myWritableStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 10 * 1024 // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip");

    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(myWritableStreamBuffer);

    // set template
    bundle.templates[template.id] = template;

    // loop over records
    for await (const record of payload) {
      let newRecord = {
        area: {
          id: record.attributes.areaOfInterest,
          name: record.attributes.areaOfInterestName
        },
        reportName: record.attributes.reportName,
        userPosition: record.attributes.userPosition.toString(),
        clickedPosition: JSON.stringify(record.attributes.clickedPosition),
        date: record.attributes.createdAt,
        answers: []
      };

      // loop over answers
      for await (const response of record.attributes.responses) {
        let answer = {
          value: response.value,
          questionName: response.name,
          child: null
        };
        // check if the answer is an image
        if (response.value && response.value.startsWith("https://s3.amazonaws.com")) {
          // download the image
          const image = await axios({
            url: response.value,
            responseType: "stream",
            responseEncoding: "utf-8"
          });
          // save it to the directory - directory name should be name of report/name of question
          const imagePath = `${record.attributes.reportName}/${response.name}/attachment.jpeg`;
          archive.append(image.data, { name: imagePath });
          answer.value = "image/jpeg";
          // create record in manifest.reportFiles
          bundle.manifest.reportFiles.push({
            reportName: newRecord.reportName,
            questionName: answer.questionName,
            size: image.headers["content-length"],
            path: imagePath,
            type: "image/jpeg"
          });
        }
        // check if the answer is a child
        // find an existing answer's question name inside this answer's question name
        const answerIndex = newRecord.answers.findIndex(existingAnswer => {
          let found = answer.questionName.search(existingAnswer.questionName);
          if (found === -1) return false;
          else return true;
        });
        if (answerIndex !== -1) newRecord.answers[answerIndex].child = answer;
        else newRecord.answers.push(answer);
      }
      bundle.reports.push(newRecord);
    }

    archive.append(JSON.stringify(bundle), { name: "bundle.json" });
    archive.finalize();

    return new Promise((resolve, reject) => {
      myWritableStreamBuffer.on("finish", () => {
        const contents = myWritableStreamBuffer.getContents();
        resolve(contents);
      });
      myWritableStreamBuffer.on("error", reject);
    });
  }
}

module.exports = FileService;
