package com.clinica.gestion.common.dto;

public record PageInput(Integer page, Integer size, String sortBy, String sortDir) {
    public int pageOrDefault()   { return page == null || page < 0 ? 0 : page; }
    public int sizeOrDefault()   { return size == null || size <= 0 ? 20 : Math.min(size, 200); }
    public String sortByOrId()   { return sortBy == null || sortBy.isBlank() ? "id" : sortBy; }
    public boolean isDesc()      { return "DESC".equalsIgnoreCase(sortDir); }
}
