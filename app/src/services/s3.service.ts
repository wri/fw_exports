import { S3Client, PutObjectCommand, PutObjectCommandInput, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuid } from "uuid";
import config from "config";
import logger from "../logger";

const s3Client = new S3Client({
  region: config.get("s3.region"),
  credentials: {
    accessKeyId: config.get("s3.accessKeyId"),
    secretAccessKey: config.get("s3.secretAccessKey")
  }
});

interface IConfig {
  extension: string;
  body: PutObjectCommandInput["Body"];
}

const createShareableLink = async ({ extension, body }: IConfig) => {
  const bucketParams: PutObjectCommandInput = {
    Bucket: config.get("s3.bucket"),
    // Specify the name of the new object.
    Key: `${config.get("s3.folder")}/${uuid()}${extension}`,
    // Content of the new object.
    Body: body,
    ACL: "public-read"
  };

  try {
    logger.info(`Putting file into s3 bucket: ${bucketParams.Key}`);

    // Put the object into the s3 bucket
    await s3Client.send(new PutObjectCommand(bucketParams));
  } catch (err) {
    logger.error("Error while putting file into s3 bucket", err);
  }

  try {
    logger.info(`Create a Signed Url for s3 file: ${bucketParams.Key}`);

    // Create the command.
    const command = new GetObjectCommand(bucketParams);

    // Create the presigned URL.
    return await getSignedUrl(s3Client, command, {
      expiresIn: 60 * 60 * 24 // 1 day
    });
  } catch (err) {
    logger.error("Error creating presigned URL", err);
  }
};

export default createShareableLink;
