package com.secretbox.catalog.service;

import com.secretbox.catalog.dto.ServiceCatalogDto;
import com.secretbox.catalog.repository.ServiceCatalogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CatalogService {

    private final ServiceCatalogRepository repository;

    public List<ServiceCatalogDto> listAll() {
        return repository.findAllByActiveTrueOrderBySortOrderAsc().stream()
            .map(ServiceCatalogDto::from)
            .toList();
    }

    public List<ServiceCatalogDto> listByCategory(String category) {
        return repository.findAllByActiveTrueAndCategoryOrderBySortOrderAsc(category).stream()
            .map(ServiceCatalogDto::from)
            .toList();
    }
}
