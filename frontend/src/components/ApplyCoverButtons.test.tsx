import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ApplyCoverButtons } from './ApplyCoverButtons';

describe('ApplyCoverButtons component tests', () => {
  afterEach(() => {
    cleanup();
  });
  const dummyUrl = 'https://example.com/cover.jpg';
  const coverFields = ['cover', 'banner_img', 'thumbnail'];

  it('should render nothing if onApplyImage or url is missing', () => {
    const { container: c1 } = render(
      <ApplyCoverButtons url="" coverFields={coverFields} onApplyImage={() => {}} />
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <ApplyCoverButtons url={dummyUrl} coverFields={coverFields} />
    );
    expect(c2.firstChild).toBeNull();
  });

  it('should render "设为全部" and each cover field button', () => {
    render(
      <ApplyCoverButtons
        url={dummyUrl}
        coverFields={coverFields}
        onApplyImage={() => {}}
      />
    );

    expect(screen.getByText('设为全部')).toBeDefined();
    for (const field of coverFields) {
      expect(screen.getByText(field)).toBeDefined();
    }
  });

  it('should render "设为全部封面" when fullLabel is true', () => {
    render(
      <ApplyCoverButtons
        url={dummyUrl}
        coverFields={coverFields}
        onApplyImage={() => {}}
        fullLabel={true}
      />
    );

    expect(screen.getByText('设为全部封面')).toBeDefined();
  });

  it('should call onApplyImage with all coverFields when clicking "设为全部"', () => {
    const handleApply = vi.fn();
    render(
      <ApplyCoverButtons
        url={dummyUrl}
        coverFields={coverFields}
        onApplyImage={handleApply}
      />
    );

    const applyAllBtn = screen.getByText('设为全部');
    fireEvent.click(applyAllBtn);

    expect(handleApply).toHaveBeenCalledTimes(1);
    expect(handleApply).toHaveBeenCalledWith(dummyUrl, coverFields);
  });

  it('should call onApplyImage with single field when clicking field button', () => {
    const handleApply = vi.fn();
    render(
      <ApplyCoverButtons
        url={dummyUrl}
        coverFields={coverFields}
        onApplyImage={handleApply}
      />
    );

    const bannerBtn = screen.getByText('banner_img');
    fireEvent.click(bannerBtn);

    expect(handleApply).toHaveBeenCalledTimes(1);
    expect(handleApply).toHaveBeenCalledWith(dummyUrl, ['banner_img']);
  });
});
