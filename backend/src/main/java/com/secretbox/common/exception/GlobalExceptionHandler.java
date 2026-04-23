package com.secretbox.common.exception;

import com.secretbox.common.response.ApiError;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiError> handleApi(ApiException e) {
        return ResponseEntity.status(e.getStatus())
            .body(ApiError.of(e.getCode(), e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnknown(Exception e) {
        return ResponseEntity.internalServerError()
            .body(ApiError.of("INTERNAL_ERROR", "처리 중 오류가 발생했습니다"));
    }
}
