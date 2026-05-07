package com.traderos.api.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    public record ErrorResponse(
            int status,
            String error,
            String message,
            LocalDateTime timestamp,
            Map<String, String> fieldErrors
    ) {
        static ErrorResponse of(int status, String error, String message) {
            return new ErrorResponse(status, error, message,
                    LocalDateTime.now(), null);
        }
        static ErrorResponse withFields(int status, String error,
                                        String message, Map<String, String> fields) {
            return new ErrorResponse(status, error, message,
                    LocalDateTime.now(), fields);
        }
    }

    // Handles @Valid failures on request bodies
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(
            MethodArgumentNotValidException ex) {
        Map<String, String> fields = new LinkedHashMap<>();
        ex.getBindingResult().getAllErrors().forEach(error -> {
            String field = ((FieldError) error).getField();
            fields.put(field, error.getDefaultMessage());
        });
        return ResponseEntity.badRequest().body(
                ErrorResponse.withFields(400, "Validation Failed",
                        "Request contains invalid fields", fields)
        );
    }

    // Wrong password or user not found during login
    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ErrorResponse> handleBadCredentials(
            BadCredentialsException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(
                ErrorResponse.of(401, "Unauthorized", "Invalid email or password")
        );
    }

    // Business rule violations (email already exists, etc.)
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArg(
            IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(
                ErrorResponse.of(400, "Bad Request", ex.getMessage())
        );
    }

    // Catch-all
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneral(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.internalServerError().body(
                ErrorResponse.of(500, "Internal Server Error",
                        "An unexpected error occurred")
        );
    }
}