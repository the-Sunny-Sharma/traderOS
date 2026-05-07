package com.traderos.api.dto.response;

import com.traderos.api.domain.enums.ReportStatus;
import java.time.LocalDateTime;
import java.util.UUID;

public record ReportResponse(
        UUID id,
        String brokerName,
        String fy,
        ReportStatus status,
        LocalDateTime createdAt
) {}