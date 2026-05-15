package com.traderos.api.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.client.RestClient;

@Configuration
public class RestClientConfig {

    @Value("${engine.url:http://localhost:8001}")
    private String engineUrl;

    /**
     * RestClient bean for communicating with the Python engine.
     *
     * WHY A CUSTOM ObjectMapper HERE:
     * The Python/FastAPI engine uses snake_case JSON keys ("tax_summary",
     * "fno_turnover", "audit_required"). Java conventions use camelCase.
     * Jackson by default maps JSON keys to Java field names exactly, so
     * "tax_summary" would not map to `taxSummary` — the field stays null.
     *
     * FIX: Configure a snake_case ObjectMapper on THIS RestClient's
     * HttpMessageConverter. This affects only responses from the engine.
     * The default ObjectMapper (used by all @RestController endpoints) is
     * unchanged — your AuthResponse, ReportResponse etc. still use camelCase.
     *
     * INTERVIEW POINT:
     * "How do you handle JSON naming convention differences between services?"
     * "I configured a custom ObjectMapper with SNAKE_CASE PropertyNamingStrategy
     * on the specific RestClient that talks to the Python service. This keeps
     * the conversion scoped — other beans use the default camelCase ObjectMapper.
     * The alternative is @JsonProperty annotations on every DTO field, which
     * is more explicit but verbose and easy to forget on new fields."
     *
     * DEEPER POINT — why not just annotate with @JsonProperty?
     * @JsonProperty works but couples the DTO to a specific wire format.
     * If we later add a second Python service that also returns snake_case,
     * the naming strategy on the RestClient is already there — no new
     * annotations needed. Naming strategy = policy. @JsonProperty = exception.
     * Use the policy; reserve exceptions for genuine one-offs.
     */
    @Bean
    public RestClient engineRestClient() {
        // Build an ObjectMapper that reads snake_case JSON into camelCase fields.
        // SNAKE_CASE strategy: "tax_summary" → taxSummary, "fno_turnover" → fnoTurnover
        ObjectMapper snakeCaseMapper = new ObjectMapper()
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);

        // Wrap it in the HttpMessageConverter that RestClient uses for JSON
        MappingJackson2HttpMessageConverter converter =
                new MappingJackson2HttpMessageConverter(snakeCaseMapper);

        return RestClient.builder()
                .baseUrl(engineUrl)
                .messageConverters(converters -> {
                    // Remove all existing JSON converters, add our snake_case one.
                    // This ensures no other converter intercepts and misreads the response.
                    converters.removeIf(c -> c instanceof MappingJackson2HttpMessageConverter);
                    converters.add(0, converter);  // add first — highest priority
                })
                .build();
    }
}