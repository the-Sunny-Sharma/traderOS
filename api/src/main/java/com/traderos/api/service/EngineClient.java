package com.traderos.api.service;

import com.traderos.api.dto.response.EngineResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.nio.file.Path;

@Slf4j
@Service
@RequiredArgsConstructor
public class EngineClient {

    private final RestClient engineRestClient;

    public EngineResponse parseAndAssess(
            Path filePath,
            String broker,
            double otherIncome,
            String regime
    ) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new FileSystemResource(filePath));
        body.add("broker", broker);
        body.add("other_income", String.valueOf(otherIncome));
        body.add("regime", regime);

        log.info("Calling engine for broker={} file={}", broker,
                filePath.getFileName());

        return engineRestClient.post()
                .uri("/parse-and-assess")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .onStatus(status -> status.is4xxClientError(), (request, response) -> {
                    throw new IllegalArgumentException(
                            "Engine rejected file: " + response.getStatusCode()
                    );
                })
                .onStatus(status -> status.is5xxServerError(), (request, response) -> {
                    throw new RuntimeException(
                            "Engine processing failed: " + response.getStatusCode()
                    );
                })
                .body(EngineResponse.class);
    }
}