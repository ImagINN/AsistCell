import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;   // 0-indexed
  totalPages: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  // Kaç sayfa numarası gösterilsin (maks 5, kenar ellipsis yok — sade tutalım)
  const getPages = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
    const pages: (number | '...')[] = [];
    if (currentPage <= 3) {
      pages.push(0, 1, 2, 3, 4, '...', totalPages - 1);
    } else if (currentPage >= totalPages - 4) {
      pages.push(0, '...', totalPages - 5, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1);
    } else {
      pages.push(0, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages - 1);
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-center gap-1 pt-4 pb-2 select-none">
      {/* Önceki */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 0}
        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-brand-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Önceki sayfa"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* Sayfa numaraları */}
      {getPages().map((page, idx) =>
        page === '...' ? (
          <span key={`ellipsis-${idx}`} className="px-2 text-gray-400 text-sm">…</span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page as number)}
            className={`min-w-[36px] h-9 px-2 rounded-lg text-sm font-medium border transition-colors ${
              page === currentPage
                ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-brand-primary'
            }`}
          >
            {(page as number) + 1}
          </button>
        )
      )}

      {/* Sonraki */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages - 1}
        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-brand-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Sonraki sayfa"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default Pagination;
