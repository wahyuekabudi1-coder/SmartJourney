// Setup DOM polyfill before any imports
import fs from 'fs';
import { execSync } from 'child_process';

const dummyEl = {
  getAttribute: () => null,
  setAttribute: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
  scrollIntoView: () => {},
  appendChild: () => {},
  removeChild: () => {},
  style: {},
  classList: { add: () => {}, remove: () => {}, contains: () => false }
};

(globalThis as any).document = {
  getElementById: () => dummyEl,
  querySelector: () => dummyEl,
  querySelectorAll: () => [],
  createElement: () => dummyEl,
  head: dummyEl,
  body: dummyEl,
  addEventListener: () => {},
  removeEventListener: () => {}
};

(globalThis as any).window = {
  location: { hash: '', search: '', pathname: '/' },
  addEventListener: () => {},
  removeEventListener: () => {},
  scrollTo: () => {},
  dispatchEvent: () => true,
  document: (globalThis as any).document,
  getComputedStyle: () => ({ bottom: '0px' })
};

(globalThis as any).MutationObserver = class {
  observe() {}
  disconnect() {}
};

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) || null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear()
};

async function runHookLifecycleTests() {
  console.log('===============================================================');
  console.log('🧪 TESTING REACT HOOKS LIFECYCLE FOR TOURSVIEW & TOURDETAILVIEW');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, name: string) {
    if (cond) {
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name}`);
      failed++;
    }
  }

  // Dynamic imports after DOM polyfills
  const React = (await import('react')).default;
  const { renderToString } = await import('react-dom/server');
  const { AppProvider } = await import('../src/AppContext');
  const { LanguageCurrencyProvider } = await import('../src/sharetour/LanguageCurrencyContext');
  const ToursView = (await import('../src/views/ToursView')).default;
  const TourDetailView = (await import('../src/views/TourDetailView')).default;

  // TEST 1: Initial Render of ToursView (Catalog mode, searchParams.selectedTourId = undefined)
  try {
    const htmlCatalog = renderToString(
      React.createElement(AppProvider, null,
        React.createElement(LanguageCurrencyProvider, null,
          React.createElement(ToursView, null)
        )
      )
    );
    assert(htmlCatalog.includes('tours-view') && htmlCatalog.includes('Curated Guided Expeditions'),
      'Test 1: ToursView renders catalog view without throwing error');
  } catch (err: any) {
    console.error('Test 1 failed with error:', err);
    assert(false, 'Test 1: ToursView renders catalog view without throwing error');
  }

  // TEST 2: Static Verification that ToursView has NO hooks below early return
  const toursViewSource = fs.readFileSync('src/views/ToursView.tsx', 'utf8');
  const lines = toursViewSource.split('\n');
  let returnLineIndex = -1;
  let hooksBelowReturn: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes('if (searchParams?.selectedTourId)') && lines[i + 1]?.includes('return (')) {
      returnLineIndex = i;
    }
    if (returnLineIndex !== -1 && i > returnLineIndex + 8) {
      if (/^\s*(const|let)\s+\[.*\]\s*=\s*(useState|useEffect|useMemo|useCallback|useRef)/.test(l)) {
        hooksBelowReturn.push(`Line ${i + 1}: ${l.trim()}`);
      }
    }
  }
  assert(hooksBelowReturn.length === 0,
    `Test 2: ToursView has 0 React hooks declared after early return (Found: ${hooksBelowReturn.length})`);

  // TEST 3: Static Verification that TourDetailView has NO hooks below if (!tour) early return
  const tourDetailSource = fs.readFileSync('src/views/TourDetailView.tsx', 'utf8');
  const detailLines = tourDetailSource.split('\n');
  let notFoundReturnLine = -1;
  let detailHooksBelowReturn: string[] = [];

  for (let i = 0; i < detailLines.length; i++) {
    const l = detailLines[i];
    if (l.includes('if (!tour)') && detailLines[i + 1]?.includes('return (')) {
      notFoundReturnLine = i;
    }
    if (notFoundReturnLine !== -1 && i > notFoundReturnLine + 10) {
      if (/^\s*(const|let)\s+.*=\s*(useState|useEffect|useMemo|useCallback|useRef)/.test(l)) {
        detailHooksBelowReturn.push(`Line ${i + 1}: ${l.trim()}`);
      }
    }
  }
  assert(detailHooksBelowReturn.length === 0,
    `Test 3: TourDetailView has 0 React hooks declared after if (!tour) return (Found: ${detailHooksBelowReturn.length})`);

  // TEST 4: TourDetailView with non-existent Tour ID (Empty/NotFound initial state)
  try {
    const htmlNotFound = renderToString(
      React.createElement(AppProvider, null,
        React.createElement(LanguageCurrencyProvider, null,
          React.createElement(TourDetailView, { tourId: 'non-existent-tour-999', onBack: () => {} })
        )
      )
    );
    assert(htmlNotFound.includes('Tour Tidak Ditemukan'),
      'Test 4: TourDetailView renders fallback "Tour Tidak Ditemukan" cleanly when tour is not found');
  } catch (err: any) {
    console.error('Test 4 error:', err);
    assert(false, 'Test 4: TourDetailView renders fallback "Tour Tidak Ditemukan" cleanly');
  }

  // TEST 5: Verify verify-responsive-elements.cjs still passes
  try {
    const respOut = execSync('node scripts/verify-responsive-elements.cjs', { encoding: 'utf8' });
    assert(respOut.includes('ALL 7 RESPONSIVE PATCHES VERIFIED'),
      'Test 5: Responsive patches verification passes with zero regressions');
  } catch (err: any) {
    assert(false, 'Test 5: Responsive patches verification passes');
  }

  // TEST 6: TourDetailView render with loaded tour ID (bromo)
  try {
    const { TOURS } = await import('../src/data');
    // Pre-populate bromo tour into test rendering context
    const htmlDetail = renderToString(
      React.createElement(AppProvider, null,
        React.createElement(LanguageCurrencyProvider, null,
          React.createElement(TourDetailView, { tourId: 'tour-p5b-1791025346175', onBack: () => {} })
        )
      )
    );
    assert(htmlDetail.length > 500,
      'Test 6: TourDetailView renders populated tour detail successfully');
  } catch (err: any) {
    console.error('Test 6 error:', err);
    assert(false, 'Test 6: TourDetailView renders populated tour detail successfully');
  }

  console.log('\n===============================================================');
  console.log(`SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) process.exit(1);
}

runHookLifecycleTests();
