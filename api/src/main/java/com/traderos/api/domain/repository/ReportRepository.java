package com.traderos.api.domain.repository;

import com.traderos.api.domain.entity.Report;
import com.traderos.api.domain.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReportRepository extends JpaRepository<Report, UUID> {
    List<Report> findByUserOrderByCreatedAtDesc(User user);
    Optional<Report> findByIdAndUser(UUID id, User user);
}