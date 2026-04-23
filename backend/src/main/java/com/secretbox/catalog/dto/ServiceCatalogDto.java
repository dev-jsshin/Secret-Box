package com.secretbox.catalog.dto;

import com.secretbox.catalog.domain.ServiceCatalog;

import java.util.List;

public record ServiceCatalogDto(
    String slug,
    String name,
    String nameEn,
    String category,
    String brandColor,
    String iconUrl,
    String defaultUrl,
    List<String> aliases
) {
    public static ServiceCatalogDto from(ServiceCatalog s) {
        return new ServiceCatalogDto(
            s.getSlug(),
            s.getName(),
            s.getNameEn(),
            s.getCategory(),
            s.getBrandColor(),
            s.getIconUrl(),
            s.getDefaultUrl(),
            s.getAliases()
        );
    }
}
