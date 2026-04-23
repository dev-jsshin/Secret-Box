package com.secretbox.catalog.controller;

import com.secretbox.catalog.dto.ServiceCatalogDto;
import com.secretbox.catalog.service.CatalogService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/catalog")
@RequiredArgsConstructor
public class CatalogController {

    private final CatalogService catalogService;

    @GetMapping("/services")
    public ResponseEntity<CatalogListResponse> list(
        @RequestParam(required = false) String category
    ) {
        List<ServiceCatalogDto> services = (category == null || category.isBlank())
            ? catalogService.listAll()
            : catalogService.listByCategory(category);
        return ResponseEntity.ok(new CatalogListResponse(services));
    }

    public record CatalogListResponse(List<ServiceCatalogDto> services) {}
}
