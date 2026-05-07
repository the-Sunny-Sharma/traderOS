package com.traderos.api.dto.response;

public record AuthResponse(
        String token,
        String email,
        String fullName,
        String tokenType
) {
    public static AuthResponse of(String token, String email, String fullName) {
        return new AuthResponse(token, email, fullName, "Bearer");
    }
}