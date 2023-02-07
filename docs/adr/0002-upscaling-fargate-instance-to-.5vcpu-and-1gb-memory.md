# 2. Upscaling fargate instance to .5vCPU and 1GB memory

Date: 2023-02-07

## Status

2023-02-07 accepted

## Context

Adding rotation before exporting images as a pdf caused the current instance of .25vCPU and 512MB to become overwhelmed and become unresponsive as the image rotation is a computationally intensive operation once the imag esizes get large.

## Decision

To upgrade the instance to .5vCPU and 1GB. The memory of the instance was not the bottleneck here, however, with the update of the cpu the lowest memory configuration available to us with fargate autoscaling is 1GB ([docs](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html)).

## Consequences

Will result in a higher cost of running.
