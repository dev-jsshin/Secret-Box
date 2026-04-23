package com.secretbox.vault.controller;

import com.secretbox.auth.security.AuthenticatedUser;
import com.secretbox.vault.dto.CreateVaultItemRequest;
import com.secretbox.vault.dto.UpdateVaultItemRequest;
import com.secretbox.vault.dto.VaultItemDto;
import com.secretbox.vault.service.VaultService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/vault")
@RequiredArgsConstructor
public class VaultController {

    private final VaultService vaultService;

    @GetMapping("/items")
    public ResponseEntity<VaultItemListResponse> list(
        @AuthenticationPrincipal AuthenticatedUser user
    ) {
        List<VaultItemDto> items = vaultService.list(user.userId());
        return ResponseEntity.ok(new VaultItemListResponse(items));
    }

    @PostMapping("/items")
    public ResponseEntity<VaultItemDto> create(
        @AuthenticationPrincipal AuthenticatedUser user,
        @Valid @RequestBody CreateVaultItemRequest request
    ) {
        VaultItemDto created = vaultService.create(user.userId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/items/{id}")
    public ResponseEntity<VaultItemDto> update(
        @AuthenticationPrincipal AuthenticatedUser user,
        @PathVariable UUID id,
        @Valid @RequestBody UpdateVaultItemRequest request
    ) {
        VaultItemDto updated = vaultService.update(user.userId(), id, request);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/items/{id}")
    public ResponseEntity<Void> delete(
        @AuthenticationPrincipal AuthenticatedUser user,
        @PathVariable UUID id
    ) {
        vaultService.delete(user.userId(), id);
        return ResponseEntity.noContent().build();
    }

    public record VaultItemListResponse(List<VaultItemDto> items) {}
}
