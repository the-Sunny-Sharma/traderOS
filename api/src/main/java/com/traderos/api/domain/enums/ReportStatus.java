package com.traderos.api.domain.enums;

public enum ReportStatus {
    PENDING,      // file uploaded, job queued
    PROCESSING,   // Python engine is working
    COMPLETED,    // results saved to DB
    FAILED        // engine returned an error
}