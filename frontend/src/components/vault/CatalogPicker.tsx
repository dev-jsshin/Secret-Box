import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { CATEGORY_LABELS, catalogApi, type ServiceCatalogItem } from '../../api/catalog';
import Avatar from './Avatar';
import './CatalogPicker.css';

interface CatalogPickerProps {
  value: string;
  onChange: (name: string) => void;
  onSelect: (item: ServiceCatalogItem | null) => void;
}

/**
 * 이름 입력 시 카탈로그를 자동완성. 매칭 항목 클릭 시 부모에 전달.
 * 매칭 안 되거나 사용자가 자유 입력하면 onSelect(null) — custom 항목으로 처리.
 */
export default function CatalogPicker({ value, onChange, onSelect }: CatalogPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => catalogApi.list(),
    staleTime: 1000 * 60 * 60,
  });

  const matches = useMemo(() => {
    if (!value || !data) return [];
    const q = value.toLowerCase().trim();
    return data.services
      .filter((s) =>
        s.name.toLowerCase().includes(q)
        || s.nameEn?.toLowerCase().includes(q)
        || s.aliases.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [value, data]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div className="cat-picker" ref={wrapRef}>
      <input
        type="text"
        className="cat-picker__input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onSelect(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="네이버, Google, 슬랙…"
        autoComplete="off"
      />
      <span className="cat-picker__rule" aria-hidden />

      {open && matches.length > 0 && (
        <ul className="cat-picker__menu">
          {matches.map((item) => (
            <li key={item.slug}>
              <button
                type="button"
                className="cat-picker__option"
                onClick={() => {
                  onChange(item.name);
                  onSelect(item);
                  setOpen(false);
                }}
              >
                <Avatar
                  name={item.name}
                  iconUrl={item.iconUrl}
                  brandColor={item.brandColor}
                  size={26}
                />
                <span className="cat-picker__name">{item.name}</span>
                <span className="cat-picker__cat">{CATEGORY_LABELS[item.category]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
