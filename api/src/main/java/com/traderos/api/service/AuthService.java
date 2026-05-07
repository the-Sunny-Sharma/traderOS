package com.traderos.api.service;

import com.traderos.api.domain.entity.User;
import com.traderos.api.domain.repository.UserRepository;
import com.traderos.api.dto.request.LoginRequest;
import com.traderos.api.dto.request.RegisterRequest;
import com.traderos.api.dto.response.AuthResponse;
import com.traderos.api.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtUtil jwtUtil;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new IllegalArgumentException(
                    "Email already registered: " + request.email()
            );
        }

        User user = User.builder()
                .email(request.email())
                .passwordHash(passwordEncoder.encode(request.password()))
                .fullName(request.fullName())
                .build();

        userRepository.save(user);
        log.info("New user registered: {}", request.email());

        String token = jwtUtil.generateToken(user.getEmail());
        return AuthResponse.of(token, user.getEmail(), user.getFullName());
    }

    public AuthResponse login(LoginRequest request) {
        // This throws BadCredentialsException if email/password is wrong
        // GlobalExceptionHandler converts that to 401
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        request.email(),
                        request.password()
                )
        );

        User user = userRepository.findByEmail(request.email())
                .orElseThrow(() ->
                        new BadCredentialsException("User not found")
                );

        String token = jwtUtil.generateToken(user.getEmail());
        return AuthResponse.of(token, user.getEmail(), user.getFullName());
    }
}