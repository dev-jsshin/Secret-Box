package com.secretbox.auth.dto;

public record PreLoginResponse(
    String kdfSalt,            // base64
    int kdfIterations,
    int kdfMemoryKb,
    int kdfParallelism
) {}
