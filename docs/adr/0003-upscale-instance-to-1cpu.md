# 3. Upscale instance to 1cpu

Date: 2023-02-09

## Status

2023-02-09 accepted

## Context

Refer to [ADR #2](0002-upscaling-fargate-instance-to-.5vcpu-and-1gb-memory.md). The upscale was not enough and would fail with multiple requests

## Decision

Upscale to 1cpu

## Consequences

Increase in running costs.
