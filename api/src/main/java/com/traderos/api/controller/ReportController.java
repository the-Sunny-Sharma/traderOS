package com.traderos.api.controller;

import com.traderos.api.domain.entity.User;
import com.traderos.api.domain.repository.UserRepository;
import com.traderos.api.dto.response.ReportDetailResponse;
import com.traderos.api.dto.response.ReportResponse;
import com.traderos.api.service.ReportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
@Tag(name = "Reports", description = "File upload and tax assessment")
@SecurityRequirement(name = "bearerAuth")
public class ReportController {

    private final ReportService reportService;
    private final UserRepository userRepository;

    @PostMapping(value = "/upload",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(summary = "Upload broker P&L file for tax assessment")
    public ReportResponse upload(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestPart("file") MultipartFile file,
            @RequestParam("broker") String broker,
            @RequestParam(value = "fy", defaultValue = "2024-25") String fy,
            @RequestParam(value = "otherIncome", defaultValue = "0") double otherIncome,
            @RequestParam(value = "regime", defaultValue = "new") String regime
    ) throws IOException {
        User user = resolveUser(userDetails);
        return reportService.uploadAndProcess(
                user, file, broker, fy, otherIncome, regime
        );
    }

    @GetMapping
    @Operation(summary = "List all reports for the authenticated user")
    public List<ReportResponse> listReports(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = resolveUser(userDetails);
        return reportService.getUserReports(user);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get full report detail including tax summary")
    public ReportDetailResponse getReport(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable UUID id) {
        User user = resolveUser(userDetails);
        return reportService.getReportDetail(id, user);
    }

    private User resolveUser(UserDetails userDetails) {
        return userRepository.findByEmail(userDetails.getUsername())
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
    }
}