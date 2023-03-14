# 1. Automatic rotation of JPEG images

Date: 2023-02-03

## Status

2023-02-03 accepted

## Context

When exporting images as a pdf the `pdfkit` npm library doesn't respect EXIF metadata on the image ([pdfkit issue #626](https://github.com/foliojs/pdfkit/issues/626)) which causes the image orientation to be incorrect in the pdf when the orientation is mentioned in the EXIF metadata.

The noted bug was that images taken from the mobile app wouldn't display correctly where both, landscape and portrait images, would display in the landscape orientation ([GFW-1662](https://3sidedcube.atlassian.net/browse/GFW-1662)). This was due to the fact the images taken via iOS devices are sent as jpg and record the orientation of the image via EXIF metadata.

## Decision

Rotate the images to the correct orientation before inserting them into the pdf. This is to be achieved by using the [jpeg-autorotate](https://www.npmjs.com/package/jpeg-autorotate) library.

## Consequences

This will cover the bug for jpg images but may not address other types of images.
