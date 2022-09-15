/* eslint-disable prettier/prettier */
import config from "config";
const SparkPost = require("sparkpost");
const sparky = new SparkPost(config.get('sparkpost.apiKey'));
import logger from "../logger";

class SparkpostService {
    static async sendMail(email, url) {
        
        logger.info(`Sending email to ${email}`)
        
        sparky.transmissions
            .send({
                options: {
                },
                content: {
                    from: "noreply@globalforestwatch.org",
                    subject: "GFW Export",
                    html: `<html><body><p>Your export can be found at: ${url}</p></body></html>`
                },
                recipients: [{ address: email }]
            })
    }
}

module.exports = SparkpostService;