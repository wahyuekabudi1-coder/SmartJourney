const { chromium } = require('playwright');

const viewports = [
  { name: 'Mobile Kecil (320x568)', width: 320, height: 568 },
  { name: 'Mobile Umum (375x812)', width: 375, height: 812 },
  { name: 'Mobile Besar (430x932)', width: 430, height: 932 },
  { name: 'Tablet Portrait (768x1024)', width: 768, height: 1024 },
  { name: 'Tablet Landscape (1024x768)', width: 1024, height: 768 },
  { name: 'Desktop Baseline (1440x900)', width: 1440, height: 900 }
];

async function runBrowserAudit() {
  console.log('🚀 MEMULAI PENGUJIAN REAL BROWSER (PLAYWRIGHT CHROMIUM) UNTUK 7 PERBAIKAN RESPONSIVE...\n');
  const browser = await chromium.launch();
  let overallPassed = true;

  for (const vp of viewports) {
    console.log(`================================================================`);
    console.log(`📱 PENGUJIAN VIEWPORT: ${vp.name}`);
    console.log(`================================================================`);

    // -------------------------------------------------------------------------
    // TEST 1: TourDetailView & FloatingWhatsApp
    // -------------------------------------------------------------------------
    const pageDetail = await browser.newPage();
    await pageDetail.setViewportSize({ width: vp.width, height: vp.height });
    await pageDetail.goto('http://localhost:3000/#/tours?tour=tour-p5b-1791025346175', { waitUntil: 'networkidle' });
    await pageDetail.waitForTimeout(600);

    const waTourAudit = await pageDetail.evaluate(() => {
      const bar = document.getElementById('tour-sticky-checkout-bar');
      const waLink = document.querySelector('a[aria-label*="WhatsApp"]');
      const waCont = waLink ? waLink.parentElement : null;
      if (!bar || !waCont) return { found: false };

      const barRect = bar.getBoundingClientRect();
      const waRect = waCont.getBoundingClientRect();
      const isOverlapping = !(
        waRect.bottom < barRect.top ||
        waRect.top > barRect.bottom ||
        waRect.right < barRect.left ||
        waRect.left > barRect.right
      );

      const proceedBtn = document.getElementById('btn-sticky-proceed') || document.getElementById('btn-sticky-select-date');
      const proceedRect = proceedBtn ? proceedBtn.getBoundingClientRect() : null;

      return {
        found: true,
        barTop: Math.round(barRect.top),
        barHeight: Math.round(barRect.height),
        waBottom: Math.round(waRect.bottom),
        waBottomStyle: window.getComputedStyle(waCont).bottom,
        isOverlapping,
        clearance: Math.round(barRect.top - waRect.bottom),
        proceedBtnVisible: !!proceedBtn && proceedRect && proceedRect.width > 0 && proceedRect.height > 0
      };
    });
    await pageDetail.close();

    // Check Home WA position (should NOT be shifted up on pages without sticky bar)
    const pageHome = await browser.newPage();
    await pageHome.setViewportSize({ width: vp.width, height: vp.height });
    await pageHome.goto('http://localhost:3000/#/', { waitUntil: 'networkidle' });
    await pageHome.waitForTimeout(500);

    const waHomeAudit = await pageHome.evaluate(() => {
      const waLink = document.querySelector('a[aria-label*="WhatsApp"]');
      const waCont = waLink ? waLink.parentElement : null;
      if (!waCont) return null;
      return {
        bottomStyle: window.getComputedStyle(waCont).bottom,
        bottomPx: Math.round(parseFloat(window.getComputedStyle(waCont).bottom))
      };
    });

    const t1_pass = waTourAudit.found && !waTourAudit.isOverlapping && waTourAudit.proceedBtnVisible && waHomeAudit && waHomeAudit.bottomPx <= 24;
    console.log(`1. TourDetailView & FloatingWhatsApp:`);
    console.log(`   - Sticky checkout bar terdeteksi: ${waTourAudit.found ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   - WhatsApp clearance di atas sticky bar: ${waTourAudit.clearance}px (Overlap: ${waTourAudit.isOverlapping ? '❌ YA' : '✅ TIDAK'})`);
    console.log(`   - Tombol CTA sticky checkout bar terlihat & aktif: ${waTourAudit.proceedBtnVisible ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   - Posisi WhatsApp di Home (tanpa sticky bar): ${waHomeAudit ? waHomeAudit.bottomStyle : 'N/A'} (tidak bergeser global: ${waHomeAudit && waHomeAudit.bottomPx <= 24 ? '✅ PASS' : '❌ FAIL'})`);
    if (!t1_pass) overallPassed = false;

    // -------------------------------------------------------------------------
    // TEST 2: Header.tsx (Controls, Drawer, My Bookings)
    // -------------------------------------------------------------------------
    const headerAudit = await pageHome.evaluate(() => {
      const langCont = document.getElementById('mobile-lang-container');
      const currCont = document.getElementById('mobile-curr-container');
      const myBookingsBtn = document.querySelector('header button[aria-label="My Bookings"]');
      const myBookingsText = myBookingsBtn ? myBookingsBtn.querySelector('span.whitespace-nowrap') : null;

      return {
        langDisplay: langCont ? window.getComputedStyle(langCont).display : 'none',
        currDisplay: currCont ? window.getComputedStyle(currCont).display : 'none',
        myBookingsTextDisplay: myBookingsText ? window.getComputedStyle(myBookingsText).display : 'none',
        hasCalendarIcon: !!myBookingsBtn?.querySelector('svg')
      };
    });

    let t2_pass = true;
    if (vp.width < 380) {
      const hiddenOuter = headerAudit.langDisplay === 'none' && headerAudit.currDisplay === 'none';
      if (!hiddenOuter) t2_pass = false;
    } else if (vp.width < 768) {
      const visibleOuter = headerAudit.langDisplay !== 'none' && headerAudit.currDisplay !== 'none';
      if (!visibleOuter) t2_pass = false;
    }

    if (vp.width < 640) {
      if (headerAudit.myBookingsTextDisplay !== 'none' || !headerAudit.hasCalendarIcon) t2_pass = false;
    } else if (vp.width < 768) {
      if (headerAudit.myBookingsTextDisplay === 'none') t2_pass = false;
    }

    // Verify drawer has language & currency controls
    const menuBtn = await pageHome.$('header button[aria-label="Toggle Navigation Menu"]');
    let drawerControlsOk = true;
    if (menuBtn && vp.width < 768) {
      await menuBtn.click();
      await pageHome.waitForTimeout(300);
      drawerControlsOk = await pageHome.evaluate(() => {
        const drawer = document.querySelector('div.relative.z-50.md\\:hidden');
        if (!drawer) return false;
        const text = drawer.textContent || '';
        return (text.includes('Bahasa') || text.includes('Language') || text.includes('语言')) &&
               (text.includes('Mata Uang') || text.includes('Currency') || text.includes('货币') || text.includes('IDR'));
      });
      // Close menu
      await menuBtn.click();
      await pageHome.waitForTimeout(200);
    }

    console.log(`2. Header.tsx:`);
    console.log(`   - Language & Currency (<380px tersembunyi luar / >=380px tampil luar): ${t2_pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   - My Bookings label (<640px ikon+badge saja / >=640px label teks): ${t2_pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   - Kontrol Bahasa & Mata Uang tersedia di drawer: ${drawerControlsOk ? '✅ PASS' : '❌ FAIL'}`);
    if (!t2_pass || !drawerControlsOk) overallPassed = false;

    // -------------------------------------------------------------------------
    // TEST 3: HomeView.tsx Review Slider
    // -------------------------------------------------------------------------
    const reviewAudit = await pageHome.evaluate(() => {
      const prevBtn = document.querySelector('button[aria-label="Previous Reviews"]');
      const prevWrap = prevBtn ? prevBtn.parentElement : null;
      const slider = document.querySelector('div.snap-x.snap-mandatory');
      return {
        prevDisplay: prevWrap ? window.getComputedStyle(prevWrap).display : 'none',
        hasSwipeSlider: !!slider,
        overflowX: slider ? window.getComputedStyle(slider).overflowX : ''
      };
    });

    const t3_pass = (vp.width < 640 ? reviewAudit.prevDisplay === 'none' : reviewAudit.prevDisplay !== 'none') &&
                    reviewAudit.hasSwipeSlider &&
                    reviewAudit.overflowX.includes('auto');
    console.log(`3. HomeView Review Slider:`);
    console.log(`   - Navigasi panah (<sm disembunyikan / >=sm tampil): ${t3_pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   - Native swipe scrollable container aktif: ${reviewAudit.hasSwipeSlider ? '✅ PASS' : '❌ FAIL'}`);
    if (!t3_pass) overallPassed = false;

    // -------------------------------------------------------------------------
    // TEST 4: HomeView Search Widget
    // -------------------------------------------------------------------------
    const searchGridAudit = await pageHome.evaluate(() => {
      const form = document.getElementById('tour-search-form');
      if (!form) return null;
      const btnWrapper = form.lastElementChild;
      return {
        classes: btnWrapper ? btnWrapper.className : '',
        formCols: window.getComputedStyle(form).gridTemplateColumns.split(' ').length
      };
    });

    const t4_pass = searchGridAudit && searchGridAudit.classes.includes('sm:col-span-2 lg:col-span-1');
    console.log(`4. HomeView Search Widget:`);
    console.log(`   - Tombol Cari Tur responsive col span (sm:col-span-2 lg:col-span-1): ${t4_pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   - Grid columns terkomputasi: ${searchGridAudit ? searchGridAudit.formCols : 0} kolom`);
    if (!t4_pass) overallPassed = false;

    await pageHome.close();

    // -------------------------------------------------------------------------
    // TEST 5: CarRentalView Specs Summary
    // -------------------------------------------------------------------------
    const pageRental = await browser.newPage();
    await pageRental.setViewportSize({ width: vp.width, height: vp.height });
    await pageRental.goto('http://localhost:3000/#/car-rental', { waitUntil: 'networkidle' });
    await pageRental.waitForTimeout(400);

    const rentalAudit = await pageRental.evaluate(() => {
      const grids = Array.from(document.querySelectorAll('div[class*="grid-cols-1 sm:grid-cols-2"]'));
      return {
        hasResponsiveGrid: grids.length > 0
      };
    });
    await pageRental.close();

    console.log(`5. CarRentalView:`);
    console.log(`   - Ringkasan spesifikasi menggunakan 1 kolom (mobile) & 2 kolom (layar lebih lebar): ${rentalAudit.hasResponsiveGrid ? '✅ PASS' : '❌ FAIL'}`);
    if (!rentalAudit.hasResponsiveGrid) overallPassed = false;

    // -------------------------------------------------------------------------
    // TEST 6: ServiceNavTabs Sticky Offset
    // -------------------------------------------------------------------------
    const pageTabs = await browser.newPage();
    await pageTabs.setViewportSize({ width: vp.width, height: vp.height });
    await pageTabs.goto('http://localhost:3000/#/tours', { waitUntil: 'networkidle' });
    await pageTabs.waitForTimeout(400);

    const tabsAudit = await pageTabs.evaluate(() => {
      const header = document.getElementById('main-header');
      const tabs = document.querySelector('div.sticky.z-40');
      if (!header || !tabs) return null;
      return {
        headerHeight: Math.round(header.getBoundingClientRect().height),
        tabsClass: tabs.className
      };
    });
    await pageTabs.close();

    const t6_pass = tabsAudit && 
                    tabsAudit.tabsClass.includes('top-[64px]') &&
                    tabsAudit.tabsClass.includes('sm:top-[76px]') &&
                    tabsAudit.tabsClass.includes('md:top-[88px]');
    console.log(`6. ServiceNavTabs Sticky Offset:`);
    console.log(`   - Header height aktual: ${tabsAudit ? tabsAudit.headerHeight : 0}px`);
    console.log(`   - Sticky classes top-[64px] sm:top-[76px] md:top-[88px]: ${t6_pass ? '✅ PASS' : '❌ FAIL'}`);
    if (!t6_pass) overallPassed = false;

    // -------------------------------------------------------------------------
    // TEST 7: GatheringView Pax Selector
    // -------------------------------------------------------------------------
    const pageGathering = await browser.newPage();
    await pageGathering.setViewportSize({ width: vp.width, height: vp.height });
    await pageGathering.goto('http://localhost:3000/#/event-gathering', { waitUntil: 'networkidle' });
    await pageGathering.waitForSelector('button:has-text("Minta Penawaran")', { timeout: 6000 }).catch(() => {});

    const quoteBtn = await pageGathering.$('button:has-text("Minta Penawaran")');
    let gatheringPaxAudit = null;
    if (quoteBtn) {
      await quoteBtn.click();
      await pageGathering.waitForTimeout(400);
      gatheringPaxAudit = await pageGathering.evaluate(() => {
        const paxBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('Pax'));
        if (paxBtns.length === 0) return null;
        const container = paxBtns[0].parentElement;
        return {
          count: paxBtns.length,
          texts: paxBtns.map(b => b.textContent.trim()),
          cols: container ? window.getComputedStyle(container).gridTemplateColumns.split(' ').length : 0
        };
      });
    }
    await pageGathering.close();

    const expectedCols = vp.width < 640 ? 3 : 5;
    const t7_pass = gatheringPaxAudit && 
                    gatheringPaxAudit.count === 5 && 
                    gatheringPaxAudit.cols === expectedCols;
    console.log(`7. GatheringView Pax Selector:`);
    console.log(`   - Semua 5 opsi [60, 70, 80, 90, 90+ Pax] ada: ${gatheringPaxAudit && gatheringPaxAudit.count === 5 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   - Grid columns terkomputasi: ${gatheringPaxAudit ? gatheringPaxAudit.cols : 0} col (ekspektasi: ${expectedCols} col): ${t7_pass ? '✅ PASS' : '❌ FAIL'}`);
    if (!t7_pass) overallPassed = false;

    console.log(`----------------------------------------------------------------\n`);
  }

  await browser.close();
  console.log(`================================================================`);
  console.log(overallPassed ? '🎉 SEMUA 7 PERBAIKAN RESPONSIVE LULUS DI SELURUH 6 VIEWPORT (REAL BROWSER)!' : '⚠️ ADA PENGUJIAN YANG GAGAL');
  console.log(`================================================================\n`);
  process.exit(overallPassed ? 0 : 1);
}

runBrowserAudit().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
