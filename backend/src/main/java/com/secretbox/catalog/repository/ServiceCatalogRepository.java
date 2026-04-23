package com.secretbox.catalog.repository;

import com.secretbox.catalog.domain.ServiceCatalog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ServiceCatalogRepository extends JpaRepository<ServiceCatalog, Long> {

    List<ServiceCatalog> findAllByActiveTrueOrderBySortOrderAsc();

    List<ServiceCatalog> findAllByActiveTrueAndCategoryOrderBySortOrderAsc(String category);
}
