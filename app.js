// Supabase Configuration
const SUPABASE_URL = 'https://lynobzvbhsdnfnfeectz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5bm9ienZiaHNkbmZuZmVlY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIzMzAwNzYsImV4cCI6MjA2NzkwNjA3Nn0.-OBS5v4zMtlmMD-qtkom8tqPhYNyVCnIrJWolNbtG5A';

// --- 전역 변수 ---
let map = null; let schoolMarkers = []; let apartmentMarkers = [];
let bottomSheetElement = null;
let filterPanel = null; let overlay = null; let filterToggleBtn = null;
let rawSchoolData = []; let isDataLoaded = false; let currentFilter = 0;
let selectedGrade = 1; let currentlyDisplayedRegions = null; let isLoading = false;
let selectedSchoolTypes = ['ALL'];
const DYNAMIC_FILTER_ZOOM_LEVEL = 13; const DYNAMIC_FILTER_MIN_STUDENTS = 100;
let gradeChartInstance = null;
const panelControlIds = ['grade_selector', 'student_filter', 'apply_student_filter_btn', 'clear_filter_btn', 'search_input', 'search_btn', 'load_apply_btn', 'select_all_regions'];
let loadingSpinnerPanel, statusTextPanel;
let loadingStatusOverlay, loadingSpinnerOverlay, statusTextOverlay;
let searchResultsContainer;
let createdMarkerCount = 0;
let currentIndex = 0;
let isMapInitialized = false;

// --- Supabase API Functions ---
async function getSchoolData(selectedRegions) {
    console.log(`[Supabase] getSchoolData received selectedRegions: ${JSON.stringify(selectedRegions)}`);
    
    try {
        let query = `${SUPABASE_URL}/rest/v1/schools?select=*,apartments(*)&limit=5000`;
        
        // 지역 필터링 (edu_office 필드에서 LIKE 검색)
        // selectedRegions가 null이거나 빈 배열이면 전체 데이터 로드
        if (selectedRegions && Array.isArray(selectedRegions) && selectedRegions.length > 0 && !selectedRegions.includes('ALL')) {
            const regionPatterns = selectedRegions.map(region => {
                // 각 지역별 패턴 매핑
                const regionMap = {
                    '서울특별시교육청': '서울특별시',
                    '경기도교육청': '경기도',
                    '인천광역시교육청': '인천광역시',
                    '부산광역시교육청': '부산광역시',
                    '대구광역시교육청': '대구광역시',
                    '광주광역시교육청': '광주광역시',
                    '대전광역시교육청': '대전광역시',
                    '울산광역시교육청': '울산광역시',
                    '세종특별자치시교육청': '세종특별자치시',
                    '강원도교육청': '강원도',
                    '충청북도교육청': '충청북도',
                    '충청남도교육청': '충청남도',
                    '전라북도교육청': '전라북도',
                    '전라남도교육청': '전라남도',
                    '경상북도교육청': '경상북도',
                    '경상남도교육청': '경상남도',
                    '제주특별자치도교육청': '제주특별자치도'
                };
                
                const baseRegion = regionMap[region] || region.replace('교육청', '');
                return `edu_office.like.*${baseRegion}*`;
            }).join(',');
            query += `&or=(${regionPatterns})`;
        }
        
        const response = await fetch(query, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const schools = await response.json();
        console.log(`[Supabase] Retrieved ${schools.length} schools from database`);
        
        // 학교 종류 데이터 확인을 위한 디버깅
        if (schools.length > 0) {
            console.log('[DEBUG] Sample school data:', {
                name: schools[0].name,
                public_Yn: schools[0].public_Yn,
                estType_raw: schools[0].public_Yn
            });
            
            // 서울교대부속초등학교 찾기
            const testSchool = schools.find(s => s.name && s.name.includes('서울교대부속'));
            if (testSchool) {
                console.log('[DEBUG] 서울교대부속초등학교 데이터:', {
                    name: testSchool.name,
                    public_Yn: testSchool.public_Yn,
                    raw_data: testSchool
                });
            }
            
            // 다양한 학교 종류 샘플 확인
            schools.slice(0, 10).forEach((school, idx) => {
                console.log(`[DEBUG] School ${idx}:`, {
                    name: school.name,
                    public_Yn: school.public_Yn,
                    type: typeof school.public_Yn
                });
            });
        }

        // Google Apps Script 형식으로 변환
        return schools.map(school => ({
            name: school.name,
            eduOffice: school.edu_office,
            address: school.address,
            lat: school.lat,
            lng: school.lng,
            estType: school.public_Yn || '공립',
            grade1Classes: school.grade1_classes || 0,
            grade1Students: school.grade1_students || 0,
            grade1PerClass: school.grade1_per_class || 0,
            grade2Classes: school.grade2_classes || 0,
            grade2Students: school.grade2_students || 0,
            grade2PerClass: school.grade2_per_class || 0,
            grade3Classes: school.grade3_classes || 0,
            grade3Students: school.grade3_students || 0,
            grade3PerClass: school.grade3_per_class || 0,
            grade4Classes: school.grade4_classes || 0,
            grade4Students: school.grade4_students || 0,
            grade4PerClass: school.grade4_per_class || 0,
            grade5Classes: school.grade5_classes || 0,
            grade5Students: school.grade5_students || 0,
            grade5PerClass: school.grade5_per_class || 0,
            grade6Classes: school.grade6_classes || 0,
            grade6Students: school.grade6_students || 0,
            grade6PerClass: school.grade6_per_class || 0,
            totalStudents: school.total_students || 0,
            teachers: school.teachers || 0,
            apartments: (school.apartments || []).map(apt => ({
                name: apt.name,
                address: apt.address,
                lat: apt.lat,
                lng: apt.lng,
                households: apt.households,
                parkingPerHH: apt.parking_per_hh,
                parkingUnderground: apt.parking_underground,
                aptAge: apt.apt_age
            }))
        }));
        
    } catch (error) {
        console.error(`[Supabase] getSchoolData Error: ${error.message}`);
        throw new Error(`Server error processing school data: ${error.message}`);
    }
}

// --- API 로딩 오류 처리 ---
function handleApiError() {
    console.error('Naver Maps API load failed.');
    const msg = '오류: 지도 API 로딩 실패.';
    const panelStatus = document.getElementById('status_text_panel');
    const overlayStatus = document.getElementById('status_text_overlay');
    if(panelStatus) panelStatus.textContent = msg;
    if(overlayStatus) overlayStatus.textContent = msg;
    alert('지도 API 로딩 실패. 페이지를 새로고침하거나 관리자에게 문의하세요.');
    const panelSpinner = document.getElementById('loading_spinner_panel');
    const overlayIndicator = document.getElementById('loading_status_overlay');
    if(panelSpinner) panelSpinner.style.display = 'none';
    if(overlayIndicator) overlayIndicator.style.display = 'none';
}

// --- 로딩 상태 표시 및 컨트롤 제어 ---
function setLoading(loading, message = null) {
    if (!loadingSpinnerPanel || !loadingStatusOverlay || !statusTextPanel || !statusTextOverlay) {
        console.warn("setLoading called before essential loading elements are ready.");
        return;
    }
    isLoading = loading;
    const spinnerDisplay = loading ? 'block' : 'none';
    loadingSpinnerPanel.style.display = spinnerDisplay;
    if(loadingSpinnerOverlay) loadingSpinnerOverlay.style.display = spinnerDisplay;
    if (message) updateLoadingStatus(message);
    loadingStatusOverlay.style.display = loading ? 'flex' : 'none';
    if (loading && message && statusTextOverlay) statusTextOverlay.textContent = message;

    enableControls(isDataLoaded);
}

// --- 데이터 로드 상태에 따른 컨트롤 활성화/비활성화 ---
function enableControls(isContentLoaded) {
    if (!filterPanel) { console.warn("Filter panel not found, cannot update control states."); return; }

    const loadApplyBtn = document.getElementById('load_apply_btn');
    if (loadApplyBtn) {
        loadApplyBtn.disabled = isLoading;
    }

    const dataDependentControls = ['student_filter', 'apply_student_filter_btn', 'clear_filter_btn', 'search_input', 'search_btn'];
    dataDependentControls.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.disabled = !isContentLoaded || isLoading;
        }
    });

    const gradeSelector = document.getElementById('grade_selector');
    if (gradeSelector) {
        gradeSelector.disabled = isLoading;
    }

    const selectAllCheckbox = document.getElementById('select_all_regions');
    const regionCheckboxes = filterPanel.querySelectorAll('#region_checkboxes input[name="region"]:not(#select_all_regions)');

    if (!isLoading) {
        if (selectAllCheckbox) selectAllCheckbox.disabled = false;
        const isAllChecked = selectAllCheckbox && selectAllCheckbox.checked;
        regionCheckboxes.forEach(cb => { cb.disabled = isAllChecked; });
    } else {
        if (selectAllCheckbox) selectAllCheckbox.disabled = true;
        regionCheckboxes.forEach(cb => cb.disabled = true);
    }
}

// --- 로딩 상태 메시지 업데이트 ---
function updateLoadingStatus(message) {
    if (statusTextPanel) statusTextPanel.textContent = message;
    if (statusTextOverlay && loadingStatusOverlay && loadingStatusOverlay.style.display !== 'none') {
        statusTextOverlay.textContent = message;
    }
    console.log("Status Update:", message);
}

// --- 필터 패널 제어 ---
function toggleFilterPanel() {
    if (!filterPanel || !overlay) return;
    filterPanel.classList.toggle('visible');
    overlay.classList.toggle('visible');
    if (!filterPanel.classList.contains('visible')) clearSchoolSearchResults();
}

function closeFilterPanel() {
    if (!filterPanel || !overlay) return;
    filterPanel.classList.remove('visible');
    overlay.classList.remove('visible');
    clearSchoolSearchResults();
}

// --- 바텀 시트 제어 ---
function openBottomSheet(contentHtml) {
    if (!bottomSheetElement) { console.error("Bottom sheet element not found."); return; }
    const contentArea = bottomSheetElement.querySelector('.bottom_sheet_content');
    if (!contentArea) { console.error("Bottom sheet content area not found."); return; }
    contentArea.innerHTML = contentHtml;
    bottomSheetElement.classList.add('visible');
    contentArea.scrollTop = 0;
    console.log("Bottom sheet opened with new content.");
}

function closeBottomSheet() {
    if (bottomSheetElement && bottomSheetElement.classList.contains('visible')) {
        bottomSheetElement.classList.remove('visible');
        destroyChart();
        console.log("Bottom sheet closed.");
    }
}

// --- 모든 정보창/바텀시트 닫기 ---
function closeInfoDisplays() { closeBottomSheet(); }

// --- 차트 파괴 ---
function destroyChart() { 
    if (gradeChartInstance) { 
        gradeChartInstance.destroy(); 
        gradeChartInstance = null; 
        console.log("Previous chart instance destroyed."); 
    } 
}

// --- 학교 종류 필터 관련 함수 ---
function updateSelectedSchoolTypes() {
    const selectAllCheckbox = document.getElementById('type_all_schools');
    const typeCheckboxes = filterPanel ? filterPanel.querySelectorAll('#school_type_checkboxes input[name="schooltype"]:not(#type_all_schools)') : [];
    
    if (selectAllCheckbox && selectAllCheckbox.checked) {
        selectedSchoolTypes = ['ALL'];
    } else {
        selectedSchoolTypes = Array.from(typeCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
        if (selectedSchoolTypes.length === 0) {
            selectedSchoolTypes = ['ALL'];
            if (selectAllCheckbox) selectAllCheckbox.checked = true;
        }
    }
    console.log('Selected school types:', selectedSchoolTypes);
}

// --- 학년별 데이터 및 변화율 계산 ---
function getGradeData(schoolData, grade, type) {
    if (!schoolData || grade < 1 || grade > 6) { return type === 'PerClass' ? 0.0 : 0; }
    const key = `grade${grade}${type}`;
    const value = schoolData[key];
    if (value == null) { return type === 'PerClass' ? 0.0 : 0; }
    if (type === 'PerClass') { const num = parseFloat(value); return isNaN(num) ? 0.0 : num; }
    else { const num = parseInt(value, 10); return isNaN(num) ? 0 : num; }
}

function calculateNextGradeChange(schoolData, currentGrade) { 
    if (!schoolData || currentGrade < 1 || currentGrade >= 6) { 
        return { change: null, nextGrade: null }; 
    } 
    const currentStudents = getGradeData(schoolData, currentGrade, 'Students'); 
    const nextGrade = currentGrade + 1; 
    const nextGradeStudents = getGradeData(schoolData, nextGrade, 'Students'); 
    if (nextGradeStudents == null || nextGradeStudents === 0 || currentStudents === 0) { 
        return { change: null, nextGrade: nextGrade }; 
    } 
    const change = ((currentStudents - nextGradeStudents) / nextGradeStudents) * 100; 
    return { change: parseFloat(change.toFixed(1)), nextGrade: nextGrade }; 
}

function formatChangeRate(changeResult) { 
    if (!changeResult || changeResult.change === null || changeResult.nextGrade === null) { 
        return ''; 
    } 
    const rate = changeResult.change; 
    const nextGrade = changeResult.nextGrade; 
    const sign = rate >= 0 ? '+' : ''; 
    const rateClass = rate >= 0 ? 'rate-positive' : 'rate-negative'; 
    return `<span class="comparison_rate ${rateClass}">(vs.${nextGrade}학 ${sign}${rate}%)</span>`; 
}

function formatChangeRateForInfo(changeResult) { 
    if (!changeResult || changeResult.change === null || changeResult.nextGrade === null) { 
        return ''; 
    } 
    const rate = changeResult.change; 
    const nextGrade = changeResult.nextGrade; 
    const sign = rate >= 0 ? '+' : ''; 
    const rateClass = rate >= 0 ? 'rate-positive' : 'rate-negative'; 
    return `<span class="comparison-rate-info ${rateClass}">(vs.${nextGrade}학년 ${sign}${rate}%)</span>`; 
}

// --- 지도 초기화 ---
function initMap() {
    if (isMapInitialized) { console.warn("Map already initialized. Skipping."); return; }
    console.log("Attempting to initialize map...");
    isMapInitialized = true;

    filterPanel = document.getElementById('filter_panel');
    overlay = document.getElementById('overlay');
    filterToggleBtn = document.getElementById('filter_toggle_btn');
    bottomSheetElement = document.getElementById('bottom_sheet_info');
    loadingSpinnerPanel = document.getElementById('loading_spinner_panel');
    statusTextPanel = document.getElementById('status_text_panel');
    loadingStatusOverlay = document.getElementById('loading_status_overlay');
    loadingSpinnerOverlay = document.getElementById('loading_spinner_overlay');
    statusTextOverlay = document.getElementById('status_text_overlay');
    searchResultsContainer = document.getElementById('school_search_results');

    if (!filterPanel || !overlay || !filterToggleBtn || !bottomSheetElement || !loadingSpinnerPanel || !statusTextPanel || !loadingStatusOverlay || !loadingSpinnerOverlay || !statusTextOverlay || !searchResultsContainer) {
        console.error("Essential UI or loading elements not found! Cannot initialize map.");
        if(statusTextPanel) statusTextPanel.textContent = "오류: UI 요소 로드 실패";
        isMapInitialized = false; return;
    }
    updateLoadingStatus('지도 API 로딩 확인 중...');
    if (typeof naver === 'undefined' || typeof naver.maps === 'undefined' || typeof naver.maps.Map === 'undefined') {
        console.error("Naver Maps API not loaded or ready yet.");
        updateLoadingStatus('오류: 지도 API 로딩 실패.');
        isMapInitialized = false; return;
    }
    updateLoadingStatus('지도 객체 생성 중...');
    try {
        const mapOptions = {
            center: new naver.maps.LatLng(37.5665, 126.9780), zoom: 10, mapTypeControl: true, zoomControl: true, zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT }, mapDataControl: false, scaleControl: true, draggable: true, pinchZoom: true, scrollWheel: true, keyboardShortcuts: false, disableDoubleTapZoom: false, disableDoubleClickZoom: true, tileTransition: true, scaleControlOptions: { position: naver.maps.Position.BOTTOM_LEFT }, logoControlOptions: { position: naver.maps.Position.BOTTOM_RIGHT }, mapDataControlOptions: { position: naver.maps.Position.BOTTOM_LEFT }, useStyleMap: true
        };
        map = new naver.maps.Map('map', mapOptions);
        console.log("Map object created successfully.");

        naver.maps.Event.once(map, 'init_stylemap', function() {
            console.log("Map tiles loaded (init_stylemap event). Map is ready.");
            updateLoadingStatus('지역/학년 선택 후 [적용] 버튼을 눌러주세요.');
            enableControls(false);
        });
        naver.maps.Event.addListener(map, 'idle', function() {});
        naver.maps.Event.addListener(map, 'tilesloaded', function() {});
        naver.maps.Event.addListener(map, 'click', () => { closeInfoDisplays(); clearSchoolSearchResults(); });
        let zoomTimer = null;
        naver.maps.Event.addListener(map, 'zoom_changed', function() {
            console.log("Zoom level changed to:", map.getZoom()); clearTimeout(zoomTimer);
            zoomTimer = setTimeout(() => { if (isDataLoaded) applyGradeAndFilter(); }, 300);
        });

        // --- 컨트롤 이벤트 리스너 설정 ---
        if(filterToggleBtn) filterToggleBtn.addEventListener('click', toggleFilterPanel); else console.warn("Filter toggle button not found");
        if(filterPanel){
            const closePanelBtn = filterPanel.querySelector('.close_panel_btn');
            if(closePanelBtn) closePanelBtn.addEventListener('click', closeFilterPanel); else console.warn("Close panel button not found");
        }
        if(overlay) overlay.addEventListener('click', closeFilterPanel); else console.warn("Overlay not found");

        // --- 바텀 시트 리스너 ---
        if(bottomSheetElement){
            const bottomSheetHeader = bottomSheetElement.querySelector('.bottom_sheet_header');
            const closeBottomSheetBtn = bottomSheetElement.querySelector('.bottom_sheet_close_btn');

            if(bottomSheetHeader) {
                bottomSheetHeader.addEventListener('click', (event) => {
                    if (!closeBottomSheetBtn || !closeBottomSheetBtn.contains(event.target)) {
                        closeBottomSheet();
                    }
                });
            } else {
                console.warn("Bottom sheet header not found");
            }

            if(closeBottomSheetBtn) {
                closeBottomSheetBtn.addEventListener('click', closeBottomSheet);
            } else {
                console.warn("Bottom sheet close button not found");
            }
        } else {
            console.error("Bottom sheet element could not be found during init.");
        }

        const loadApplyBtn = document.getElementById('load_apply_btn');
        const studentFilterBtn = document.getElementById('apply_student_filter_btn');
        const searchButton = document.getElementById('search_btn');
        const searchInput = document.getElementById('search_input');
        const selectAllCheckbox = document.getElementById('select_all_regions');
        const regionCheckboxes = filterPanel ? filterPanel.querySelectorAll('#region_checkboxes input[name="region"]:not(#select_all_regions)') : [];
        const clearStudentFilterBtn = document.getElementById('clear_filter_btn');
        const selectAllSchoolTypesCheckbox = document.getElementById('type_all_schools');
        const schoolTypeCheckboxes = filterPanel ? filterPanel.querySelectorAll('#school_type_checkboxes input[name="schooltype"]:not(#type_all_schools)') : [];

        if (loadApplyBtn) loadApplyBtn.addEventListener('click', handleLoadApplyClick); else console.warn("Load/Apply button not found");
        if (studentFilterBtn) studentFilterBtn.addEventListener('click', () => { if (isDataLoaded) { applyGradeAndFilter(); closeFilterPanel(); } }); else console.warn("Apply student filter button not found");
        if (clearStudentFilterBtn) clearStudentFilterBtn.addEventListener('click', clearFilter); else console.warn("Clear filter button not found");

        if (searchInput && searchButton) {
            const performSearchIfNeeded = () => { 
                console.log("performSearchIfNeeded called"); 
                console.log("Search attempt - isDataLoaded:", isDataLoaded); 
                if (isDataLoaded) { 
                    console.log("Calling searchLocation()..."); 
                    searchLocation(); 
                } else { 
                    alert("먼저 지역/학년 선택 후 [적용] 버튼을 눌러 데이터를 로드해주세요."); 
                }
            };
            searchButton.addEventListener('click', performSearchIfNeeded);
            searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearchIfNeeded(); });
        } else console.warn("Search input or button not found");

        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                regionCheckboxes.forEach(cb => { cb.checked = false; cb.disabled = isChecked; });
                enableControls(isDataLoaded);
            });
        } else console.warn("Select All checkbox not found");

        regionCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                console.log("Region checkbox changed:", this.id, this.checked);
                const siblingSelectAll = document.getElementById('select_all_regions');
                const siblingRegions = filterPanel.querySelectorAll('#region_checkboxes input[name="region"]:not(#select_all_regions)');
                if (this.checked) { 
                    if (siblingSelectAll) siblingSelectAll.checked = false; 
                } else { 
                    const anyChecked = Array.from(siblingRegions).some(cb => cb.checked); 
                    if (!anyChecked && siblingSelectAll) { 
                        siblingSelectAll.checked = true; 
                    } 
                }
                enableControls(isDataLoaded);
            });
        });

        // 학교 종류 필터 이벤트 리스너
        if (selectAllSchoolTypesCheckbox) {
            selectAllSchoolTypesCheckbox.addEventListener('change', function() {
                const isChecked = this.checked;
                schoolTypeCheckboxes.forEach(cb => { cb.checked = false; cb.disabled = isChecked; });
                updateSelectedSchoolTypes();
                if (isDataLoaded) applyGradeAndFilter();
            });
        } else console.warn("Select All school types checkbox not found");

        schoolTypeCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                console.log("School type checkbox changed:", this.id, this.checked);
                const siblingSelectAll = document.getElementById('type_all_schools');
                const siblingTypes = filterPanel.querySelectorAll('#school_type_checkboxes input[name="schooltype"]:not(#type_all_schools)');
                if (this.checked) { 
                    if (siblingSelectAll) siblingSelectAll.checked = false; 
                } else { 
                    const anyChecked = Array.from(siblingTypes).some(cb => cb.checked); 
                    if (!anyChecked && siblingSelectAll) { 
                        siblingSelectAll.checked = true; 
                    } 
                }
                updateSelectedSchoolTypes();
                if (isDataLoaded) applyGradeAndFilter();
            });
        });

        console.log("Event listeners attached.");

    } catch (e) { 
        console.error("Error during map initialization or listener attachment:", e); 
        updateLoadingStatus('오류: 지도 초기화 중 문제 발생.'); 
        isMapInitialized = false; 
    }
}

// --- '적용' 버튼 클릭 핸들러 ---
async function handleLoadApplyClick() {
    if (isLoading) { console.log("Already loading data, please wait."); return; }
    const gradeSelector = document.getElementById('grade_selector');
    const selectAllCheckbox = document.getElementById('select_all_regions');
    const checkedRegions = filterPanel ? filterPanel.querySelectorAll('#region_checkboxes input[name="region"]:not(#select_all_regions):checked') : [];
    if (!gradeSelector || !selectAllCheckbox) { console.error("Cannot apply: Control elements not found."); return; }
    let regionsToLoad = null;
    let regionDisplayText = "전체";
    if (!selectAllCheckbox.checked) {
        if (checkedRegions.length > 0) {
            regionsToLoad = Array.from(checkedRegions).map(cb => cb.value);
            regionDisplayText = Array.from(checkedRegions).map(cb => cb.labels[0].textContent).join(', ');
        } else { alert("지역을 하나 이상 선택하거나 '전체'를 선택해주세요."); return; }
    }
    selectedGrade = parseInt(gradeSelector.value, 10) || 1;
    currentlyDisplayedRegions = regionsToLoad;
    console.log(`Apply clicked. Requesting data for Region(s): ${JSON.stringify(regionsToLoad) || 'ALL'}, Grade: ${selectedGrade}`);
    setLoading(true, `${regionDisplayText} 지역 데이터 로딩 중...`);
    clearMapData();
    
    try {
        const schoolsArray = await getSchoolData(regionsToLoad);
        onDataLoadSuccess(schoolsArray);
        window.pendingActionAfterLoad = applyGradeAndFilter;
    } catch (e) { 
        console.error("Error calling Supabase API:", e); 
        onDataLoadFailure({message: "서버 API 호출 중 오류 발생"}); 
    }
    closeFilterPanel();
}

// --- 지도 데이터 초기화 함수 ---
function clearMapData() {
    console.log("Clearing map data...");
    schoolMarkers.forEach(m => m.setMap(null)); schoolMarkers = [];
    apartmentMarkers.forEach(m => m.setMap(null)); apartmentMarkers = [];
    closeInfoDisplays();
    clearSchoolSearchResults();
    isDataLoaded = false; rawSchoolData = [];
    enableControls(false);
}

// --- 데이터 로드 성공/실패 핸들러 ---
function onDataLoadSuccess(schoolsArray) {
    const regionDisplayText = currentlyDisplayedRegions ? currentlyDisplayedRegions.map(r => r.replace(/교육청|광역시|특별자치시|특별자치도|도|특별시/g,'')).join(',') : "전체";
    console.log(`onDataLoadSuccess called with data length: ${schoolsArray ? schoolsArray.length : 'null/undefined'}`);
    if (!Array.isArray(schoolsArray)) { console.error("Received invalid data format from server:", schoolsArray); onDataLoadFailure({ message: "서버로부터 잘못된 데이터 형식을 받았습니다." }); return; }
    rawSchoolData = schoolsArray;
    isDataLoaded = true;
    updateLoadingStatus(`학교 데이터 ${schoolsArray.length}개 로드 완료 (${regionDisplayText}). 마커 생성 중...`);
    startMarkerCreation();
}

function onDataLoadFailure(error) {
    console.error("Failed to load school data:", error);
    const userMessage = `학교 데이터 로딩 실패: ${error && error.message ? error.message : '알 수 없는 오류'}. 잠시 후 다시 시도하거나 관리자에게 문의하세요.`;
    alert(userMessage);
    updateLoadingStatus("오류: 학교 데이터 로딩 실패.");
    isDataLoaded = false; setLoading(false); enableControls(false);
    window.pendingActionAfterLoad = null;
}

// --- 마커 생성 시작 함수 ---
function startMarkerCreation() {
    console.log("startMarkerCreation called. Total schools in rawData:", rawSchoolData.length);
    createdMarkerCount = 0; currentIndex = 0; schoolMarkers = [];
    const totalSchools = rawSchoolData.length;
    const regionDisplayText = currentlyDisplayedRegions ? currentlyDisplayedRegions.map(r => r.replace(/교육청|광역시|특별자치시|특별자치도|도|특별시/g,'')).join(',') : "전체";

    if (totalSchools === 0) {
        updateLoadingStatus(`표시할 학교 데이터 없음 (${regionDisplayText}).`);
        setLoading(false);
        enableControls(true);
        if (window.pendingActionAfterLoad) { 
            try { window.pendingActionAfterLoad(); } 
            catch(e) { console.error("Error in pending action with no data:", e); } 
            window.pendingActionAfterLoad = null; 
        }
        if (currentlyDisplayedRegions && currentlyDisplayedRegions.length > 0) moveMapToRegion(currentlyDisplayedRegions[0]);
        return;
    }

    if (totalSchools > 0 && rawSchoolData[0].lat && rawSchoolData[0].lng && typeof rawSchoolData[0].lat === 'number' && typeof rawSchoolData[0].lng === 'number') {
        try { 
            const firstPos = new naver.maps.LatLng(rawSchoolData[0].lat, rawSchoolData[0].lng); 
            map.setCenter(firstPos); 
            map.setZoom(11); 
        } catch (e) { 
            console.error("Error moving map to first school:", e); 
        }
    } else if (currentlyDisplayedRegions && currentlyDisplayedRegions.length > 0) { 
        moveMapToRegion(currentlyDisplayedRegions[0]); 
    }

    setTimeout(processChunk, 0);
}

// --- 마커 생성 청크 처리 함수 ---
function processChunk() {
    const CHUNK_SIZE = 100; const MAX_TIME_PER_CHUNK = 50;
    const startTime = Date.now(); const totalSchools = rawSchoolData.length;
    let processedInChunk = 0;

    while (currentIndex < totalSchools && (Date.now() - startTime < MAX_TIME_PER_CHUNK)) {
        const school = rawSchoolData[currentIndex];
        const currentSchoolIndex = currentIndex;
        processedInChunk++;

        if (school && typeof school.lat === 'number' && typeof school.lng === 'number' && !isNaN(school.lat) && !isNaN(school.lng)) {
            try {
                const position = new naver.maps.LatLng(school.lat, school.lng);
                const marker = createSchoolMarker(school, position);

                if (marker) {
                    schoolMarkers.push(marker);
                    createdMarkerCount++;
                } else {
                    console.warn(`[ProcessChunk] Marker creation function returned null for index ${currentSchoolIndex}: ${school.name}`);
                }
            } catch(e) {
                console.error(`[ProcessChunk] Error during marker creation or push for index ${currentSchoolIndex} (${school?.name}):`, e);
            }
        }
        currentIndex++;
    }

    const percentage = Math.round((currentIndex / totalSchools) * 100);
    updateLoadingStatus(`학교 마커 생성 중... (${percentage}%)`);

    if (currentIndex < totalSchools) {
        setTimeout(processChunk, 0);
    } else {
        console.log(`[ProcessChunk] All chunks finished. Final marker count: ${createdMarkerCount}, schoolMarkers array length: ${schoolMarkers.length}`);
        const displayText = currentlyDisplayedRegions ? currentlyDisplayedRegions.map(r => r.replace(/교육청|광역시|특별자치시|특별자치도|도|특별시/g,'')).join(',') : "전체";
        updateLoadingStatus(`${createdMarkerCount}개 학교 정보 표시됨 (${displayText}).`);
        if (window.pendingActionAfterLoad) {
            console.log("Markers created. Executing initial filter apply.");
            setLoading(true, "필터 적용 중...");
            setTimeout(() => {
                try { 
                    window.pendingActionAfterLoad(); 
                } catch (e) { 
                    console.error("Error during pending action execution:", e); 
                    alert("필터 적용 중 오류가 발생했습니다."); 
                } finally { 
                    window.pendingActionAfterLoad = null; 
                    setLoading(false); 
                    console.log("Initial filter applied."); 
                }
            }, 50);
        } else { 
            setLoading(false); 
        }
        enableControls(true);
    }
}

// --- 특정 지역으로 지도 이동 ---
function moveMapToRegion(regionName) {
    console.log(`Moving map to region: ${regionName}`);
    let query = regionName.replace('교육청', '');
    // 지역별 좌표 매핑 (간단한 버전)
    const regionCoords = {
        '서울특별시': { lat: 37.5665, lng: 126.9780 },
        '경기도': { lat: 37.4138, lng: 127.5183 },
        '인천광역시': { lat: 37.4563, lng: 126.7052 },
        '부산광역시': { lat: 35.1796, lng: 129.0756 },
        '대구광역시': { lat: 35.8714, lng: 128.6014 },
        '광주광역시': { lat: 35.1595, lng: 126.8526 },
        '대전광역시': { lat: 36.3504, lng: 127.3845 },
        '울산광역시': { lat: 35.5384, lng: 129.3114 }
    };
    
    const coord = regionCoords[query] || regionCoords['서울특별시'];
    try {
        map.setCenter(new naver.maps.LatLng(coord.lat, coord.lng));
        map.setZoom(10);
    } catch (e) {
        console.error("Error moving map to region:", e);
    }
}

// 이하 기존 함수들은 별도 파일에 추가 (마커 생성, 필터링, 검색 등)
// 여기서는 핵심 부분만 구현

// --- 상세 정보 표시용 HTML 생성 함수 ---
function buildSchoolDetailHtml(clickedSchool) {
    let infoContent = `<div class="custom_info_window_content">`;
    infoContent += `<strong class="info_title_school">${clickedSchool.name}</strong>`;
    infoContent += `<div class="chart-container"><canvas id="gradeChartCanvas"></canvas></div>`;
    const currentStudents = getGradeData(clickedSchool, selectedGrade, 'Students');
    const currentClasses = getGradeData(clickedSchool, selectedGrade, 'Classes');
    let currentPerClass = getGradeData(clickedSchool, selectedGrade, 'PerClass');
    if (currentPerClass === 0 && currentClasses > 0 && currentStudents > 0) { 
        currentPerClass = parseFloat((currentStudents / currentClasses).toFixed(1)); 
    }
    const studentsText = (currentStudents != null && !isNaN(currentStudents)) ? currentStudents + '명' : '정보 없음';
    const classesText = currentClasses > 0 ? currentClasses + '학급' : '';
    const perClassText = currentPerClass > 0 ? `(학급당 ${currentPerClass}명)` : '';
    const changeResult = calculateNextGradeChange(clickedSchool, selectedGrade);
    const changeRateText = formatChangeRateForInfo(changeResult);
    infoContent += `<div class="info_line"><span class="label">${selectedGrade}학년:</span><span class="value-container"><span class="student-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg>${studentsText}</span>${classesText ? `<span class="class-count-text">${classesText}</span>` : ''}${perClassText ? `<span class="per-class-text">${perClassText}</span>` : ''}${changeRateText}</span></div>`;
    
    if (clickedSchool.apartments && clickedSchool.apartments.length > 0) {
        const sortedApartments = [...clickedSchool.apartments].sort((a, b) => (b.households || 0) - (a.households || 0));
        const topApartments = sortedApartments.slice(0, 7);
        const remainingCount = sortedApartments.length - topApartments.length;
        infoContent += `<span class="apt_list_title"><svg width="16" height="16" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z" fill="#fbbc04"></path></svg> 배정 아파트 (${clickedSchool.apartments.length}개)</span><ul class="apt_list">`;
        
        topApartments.forEach(apt => {
            let detailsPartHtml = '<span class="apt_details_part">'; 
            let hasDetails = false;
            
            if (apt.aptAge != null && apt.aptAge >= 0) { 
                detailsPartHtml += `<span class="detail_item apt-age">${apt.aptAge}년차</span>`; 
                hasDetails = true; 
            }
            
            let parkingInfoHtml = '';
            if (apt.parkingPerHH != null && apt.households != null && apt.parkingUnderground != null && apt.households > 0 && apt.parkingPerHH > 0) {
                const estimatedTotalParking = apt.parkingPerHH * apt.households;
                if (estimatedTotalParking > 0 && apt.parkingUnderground >= 0) { 
                    const percentage = Math.round((apt.parkingUnderground / estimatedTotalParking) * 100); 
                    let percentClass = 'parking-ug-percent'; 
                    if (percentage === 0) percentClass += ' none'; 
                    else if (percentage < 50) percentClass += ' low'; 
                    parkingInfoHtml = `<span class="detail_item ${percentClass}">지하 ${percentage}%</span>`; 
                    hasDetails = true; 
                }
            } else if (apt.parkingUnderground != null && apt.parkingUnderground >= 0) { 
                parkingInfoHtml = `<span class="detail_item parking-ug-percent">(지하 ${apt.parkingUnderground}대)</span>`; 
                hasDetails = true; 
            }
            
            if (apt.parkingPerHH != null && apt.parkingPerHH > 0) { 
                detailsPartHtml += `<span class="detail_item parking-per-hh">${apt.parkingPerHH.toFixed(1)}대</span>`; 
                hasDetails = true; 
            }
            
            detailsPartHtml += parkingInfoHtml;
            
            if (apt.households != null && apt.households > 0) { 
                detailsPartHtml += `<span class="detail_item household-count">${apt.households}세대</span>`; 
                hasDetails = true; 
            }
            
            if (!hasDetails) { 
                detailsPartHtml += `<span class="detail_item">정보 없음</span>`; 
            }
            
            detailsPartHtml += '</span>';
            infoContent += `<li data-apt-name="${apt.name || ''}" data-apt-address="${apt.address || ''}" onclick="findApartment(this)">` + `<span class="apt_name_part">${apt.name || ''}</span>` + detailsPartHtml + `</li>`;
        });
        
        if (remainingCount > 0) { 
            infoContent += `<li style="color: #5f6368; cursor: default; justify-content: center;">... 외 ${remainingCount}개</li>`; 
        }
        infoContent += '</ul>';
    } else { 
        infoContent += '<div class="info_line" style="margin-top:10px;">배정 아파트 정보 없음</div>'; 
    }
    
    infoContent += `</div>`;
    return infoContent;
}

function buildAptDetailHtml(clickedApt) {
    let infoContent = `<div class="custom_info_window_content">`;
    infoContent += `<strong class="info_title_apt">${clickedApt.name || '이름없음'}</strong>`;
    const households = clickedApt.households;
    if (households != null && households > 0) { 
        infoContent += `<div class="apt_detail"><span class="household-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L2 12h3v8h14v-8h3L12 3zm5 15h-4v-6H7v6H3v-7.17l9-8.1 9 8.1V18z"></path></svg>${households}세대</span></div>`; 
    } else { 
        infoContent += `<div class="apt_detail" style="color: #5f6368;">세대수 정보 없음</div>`; 
    }
    
    let parkingHtml = '<div class="parking-info">'; 
    let hasParkingInfo = false;
    const parkingPerHH = clickedApt.parkingPerHH; 
    const undergroundParking = clickedApt.parkingUnderground;
    
    if (parkingPerHH != null && parkingPerHH > 0) { 
        parkingHtml += `<span class="parking-item"><span class="label">세대당:</span><span class="value">${parkingPerHH.toFixed(2)}대</span></span>`; 
        hasParkingInfo = true; 
    }
    
    if (parkingPerHH != null && households != null && undergroundParking != null && households > 0 && parkingPerHH > 0) {
        const estimatedTotalParking = parkingPerHH * households;
        if (estimatedTotalParking > 0 && undergroundParking >= 0) { 
            const percentage = Math.round((undergroundParking / estimatedTotalParking) * 100); 
            parkingHtml += `<span class="parking-item"><span class="label">지하:</span><span class="value ${percentage > 0 ? 'yes' : 'no'}">${percentage}%</span> <span style="font-size:11px; color:#888">(${undergroundParking}/${Math.round(estimatedTotalParking)})</span></span>`; 
            hasParkingInfo = true; 
        } else if (undergroundParking >= 0) { 
            parkingHtml += `<span class="parking-item"><span class="label">지하:</span><span class="value">${undergroundParking}대</span></span>`; 
            hasParkingInfo = true; 
        }
    } else if (undergroundParking != null && undergroundParking >= 0) { 
        parkingHtml += `<span class="parking-item"><span class="label">지하:</span><span class="value">${undergroundParking}대</span></span>`; 
        hasParkingInfo = true; 
    }
    
    if (!hasParkingInfo) { 
        parkingHtml += `<span class="parking-item" style="color: #9aa0a6;">주차 정보 없음</span>`; 
    }
    
    parkingHtml += '</div>'; 
    infoContent += parkingHtml;
    
    const aptAge = clickedApt.aptAge;
    if (aptAge != null && !isNaN(aptAge) && aptAge >= 0) { 
        infoContent += `<div class="apt-year-info"><span class="label">연식:</span><span class="value">${aptAge}년차</span></div>`; 
    } else { 
        infoContent += `<div class="apt-year-info" style="color: #9aa0a6;">연식 정보 없음</div>`; 
    }
    
    infoContent += `</div>`;
    return infoContent;
}

// --- 학교 상세 정보 표시 (바텀 시트만 사용) ---
function showSchoolDetails(marker) {
    try {
        const clickedSchool = marker.schoolData; 
        if (!clickedSchool) return;
        console.log("showSchoolDetails called for:", clickedSchool.name);

        const detailHtml = buildSchoolDetailHtml(clickedSchool);
        openBottomSheet(detailHtml);

        console.log("Displaying apartment markers...");
        displayApartmentMarkers(clickedSchool.apartments, false);

        setTimeout(() => {
            console.log("Attempting to create chart inside bottom sheet...");
            const canvasElement = bottomSheetElement ? bottomSheetElement.querySelector('#gradeChartCanvas') : null;
            if (canvasElement) {
                console.log("Canvas element found. Creating chart...");
                const ctx = canvasElement.getContext('2d');
                const gradeLabels = ['1', '2', '3', '4', '5', '6'];
                const gradeData = gradeLabels.map((label, index) => getGradeData(clickedSchool, index + 1, 'Students'));
                destroyChart();
                gradeChartInstance = new Chart(ctx, { 
                    type: 'bar', 
                    data: { 
                        labels: gradeLabels, 
                        datasets: [{ 
                            label: '학생 수', 
                            data: gradeData, 
                            backgroundColor: ['rgba(54, 162, 235, 0.6)','rgba(255, 99, 132, 0.6)','rgba(255, 206, 86, 0.6)','rgba(75, 192, 192, 0.6)','rgba(153, 102, 255, 0.6)','rgba(255, 159, 64, 0.6)'], 
                            borderWidth: 0 
                        }] 
                    }, 
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        plugins: { 
                            legend: { display: false }, 
                            tooltip: { 
                                callbacks: { 
                                    label: function(context) { 
                                        return ` ${context.parsed.y}명`; 
                                    } 
                                } 
                            } 
                        }, 
                        scales: { 
                            y: { 
                                beginAtZero: true, 
                                ticks:{ font:{size:10}} 
                            }, 
                            x: { 
                                title: { 
                                    display: true, 
                                    text: '학년', 
                                    font:{size:10} 
                                }, 
                                ticks:{ font:{size:10}} 
                            } 
                        } 
                    } 
                });
                console.log("Chart created successfully for", clickedSchool.name);
            } else { 
                console.error("Canvas element #gradeChartCanvas NOT FOUND in bottom sheet after timeout."); 
            }
        }, 150);

    } catch (error) { 
        console.error("showSchoolDetails error:", error); 
        alert("정보 표시 오류"); 
        closeInfoDisplays(); 
    }
}

// --- 아파트 상세 정보 표시 (바텀 시트만 사용) ---
function showApartmentDetails(marker) {
    try {
        const clickedApt = marker.aptData; 
        if (!clickedApt) return;
        console.log(`Show details for apt: ${clickedApt.name}`);
        const detailHtml = buildAptDetailHtml(clickedApt);
        openBottomSheet(detailHtml);
    } catch (error) { 
        console.error("showApartmentDetails error:", error); 
        closeInfoDisplays(); 
    }
}

// --- 학교 마커 생성 함수 ---
function createSchoolMarker(school, position) {
    try {
        const initialStudentText = '?';
        const initialNameColor = '#1a73e8';
        let schoolTypeClass = 'school_type';
        let schoolTypeText = '공립';
        
        if (school.estType === '사립') {
            schoolTypeClass = 'school_type private';
            schoolTypeText = '사립';
        } else if (school.estType === '국립') {
            schoolTypeClass = 'school_type national';
            schoolTypeText = '국립';
        }
        const markerContent = `<div class="school_marker_content"><span class="school_name" style="color: ${initialNameColor}">${school.name || ''} <span class="${schoolTypeClass}">${schoolTypeText}</span></span><div class="count_container"><span class="student_count">${initialStudentText}명</span></div></div>`;
        const markerOptions = { 
            position: position, 
            title: `${school.name || ''} (${school.address || ''})`, 
            icon: { 
                content: markerContent, 
                anchor: new naver.maps.Point(30, 15) 
            }, 
            schoolData: school, 
            zIndex: 100 
        };

        let marker = null;
        try {
            marker = new naver.maps.Marker(markerOptions);
        } catch (markerCreationError) {
            console.error(`FAILED to create naver.maps.Marker object for ${school?.name}:`, markerCreationError);
            return null;
        }

        try {
            marker.setMap(map);
        } catch (setMapError) {
            console.error(`FAILED to set marker on map for ${school?.name}:`, setMapError);
            return null;
        }

        try {
            naver.maps.Event.addListener(marker, 'click', () => { 
                showSchoolDetails(marker); 
            });
        } catch (listenerError) {
            console.error(`FAILED to add click listener for ${school?.name}:`, listenerError);
        }
        
        return marker;
    } catch (error) {
        console.error(`General error creating marker for school '${school?.name}':`, error);
        return null;
    }
}

// --- 아파트 마커 생성 함수 ---
function createApartmentMarker(apt, position) {
    try {
        const households = apt.households || 0;
        const markerSize = Math.max(24, Math.min(40, 24 + Math.floor(households / 100) * 2));
        const displayNumber = households > 0 ? Math.round(households / 100) : '?';
        const markerContent = `<div class="apt_marker" style="width:${markerSize}px; height:${markerSize}px; background-color: rgba(250, 123, 23, 0.8); font-size: ${Math.max(10, markerSize * 0.4)}px; line-height: ${markerSize}px;">${displayNumber}</div>`;
        const marker = new naver.maps.Marker({ 
            position, 
            title: apt.name || '', 
            icon: { 
                content: markerContent, 
                anchor: new naver.maps.Point(markerSize / 2, markerSize / 2) 
            }, 
            aptData: apt, 
            zIndex: 50, 
            map: map 
        });
        naver.maps.Event.addListener(marker, 'click', () => showApartmentDetails(marker));
        return marker;
    } catch (error) { 
        console.error(`Apt "${apt.name}" 마커 생성 오류:`, error); 
        return null; 
    }
}

// --- 아파트 마커 표시 및 지오코딩 요청 ---
function displayApartmentMarkers(apartments, maintainExisting = false) {
    console.log("displayApartmentMarkers called with apartments:", apartments);
    if (!maintainExisting) { 
        apartmentMarkers.forEach(m => m.setMap(null)); 
        apartmentMarkers = []; 
    }
    if (!apartments || apartments.length === 0) { 
        console.log("No apartments to display."); 
        return; 
    }
    
    apartments.forEach((apt) => {
        if (!apt || !apt.name) return;
        const aptId = apt.address ? `${apt.name}||${apt.address}` : apt.name;
        const isDup = apartmentMarkers.some(m => { 
            const mApt = m.aptData; 
            if (!mApt) return false; 
            const mId = mApt.address ? `${mApt.name}||${mApt.address}`: mApt.name; 
            return mId === aptId; 
        });
        if (isDup) return;
        
        const hasCoords = apt.lat != null && apt.lng != null && typeof apt.lat === 'number' && typeof apt.lng === 'number';
        if (hasCoords) {
            try { 
                const pos = new naver.maps.LatLng(apt.lat, apt.lng); 
                const marker = createApartmentMarker(apt, pos); 
                if(marker) apartmentMarkers.push(marker); 
            } catch (e) { 
                console.error(`Apt '${apt.name}' 좌표 오류:`, e); 
                if (apt.address) requestGeocodeForApartment(apt); 
            }
        } else if (apt.address) { 
            requestGeocodeForApartment(apt); 
        } else { 
            console.warn(`Apt '${apt.name}' 위치 정보 없음.`); 
        }
    });
    console.log(`Finished processing apartments. ${apartmentMarkers.length} markers added.`);
}

function requestGeocodeForApartment(apt) {
    console.log(`Geocoding requested for: ${apt.name} (${apt.address})`);
    naver.maps.Service.geocode({ query: apt.address }, (status, response) => {
        if(status === naver.maps.Service.Status.OK && response.v2.addresses.length > 0){
            try {
                const result = response.v2.addresses[0]; 
                const position = new naver.maps.LatLng(result.y, result.x);
                const aptIdentifier = apt.address ? (apt.name + "||" + apt.address) : apt.name;
                const isDuplicateAfterGeocode = apartmentMarkers.some(m => { 
                    const markerApt = m.aptData; 
                    if(!markerApt) return false; 
                    const markerId = markerApt.address ? `${markerApt.name}||${markerApt.address}` : markerApt.name; 
                    return markerId === aptIdentifier; 
                });
                if (!isDuplicateAfterGeocode) { 
                    const marker = createApartmentMarker(apt, position); 
                    if(marker) apartmentMarkers.push(marker); 
                } else console.log(`Duplicate marker prevented after geocoding for ${apt.name}`);
            } catch(e) { 
                console.error(`Apt '${apt.name}' 지오코딩 결과 처리 오류:`, e); 
            }
        } else { 
            console.warn(`Apt "${apt.name}" 주소(${apt.address}) 지오코딩 실패: Status ${status}`); 
        }
    });
}

// --- 학년/학생수 필터 적용 함수 ---
function applyGradeAndFilter() {
    console.log(`[ApplyFilter] Starting filter apply. Grade: ${selectedGrade}, Filter: ${currentFilter}`);
    if (!map || !isDataLoaded) { 
        console.warn("Cannot apply filters: Map or data not ready."); 
        if (!isDataLoaded) updateLoadingStatus("데이터 로드 필요."); 
        return; 
    }
    if (searchResultsContainer) clearSchoolSearchResults();

    const studentFilterInput = document.getElementById('student_filter');
    currentFilter = parseInt(studentFilterInput ? studentFilterInput.value : "0", 10) || 0;
    const currentZoom = map.getZoom();
    const isZoomedOut = currentZoom <= DYNAMIC_FILTER_ZOOM_LEVEL;
    const regionDisplayText = currentlyDisplayedRegions ? currentlyDisplayedRegions.map(r => r.replace(/교육청|광역시|특별자치시|특별자치도|도|특별시/g,'')).join(',') : "전체";

    console.log(`[ApplyFilter] Applying filter: Region(s) ${regionDisplayText}, Grade ${selectedGrade}, Min Students ${currentFilter}, Zoom ${currentZoom}, ZoomedOut Filter Active: ${isZoomedOut}`);

    let visibleCount = 0;
    console.log(`[ApplyFilter] Processing ${schoolMarkers.length} school markers.`);
    
    schoolMarkers.forEach((marker, index) => {
        if (!marker || !marker.schoolData) { 
            console.warn(`[ApplyFilter] Invalid marker or schoolData at index ${index}`); 
            return; 
        }
        const schoolData = marker.schoolData;
        const schoolName = schoolData.name || 'Unknown School';

        const students = getGradeData(schoolData, selectedGrade, 'Students');

        try {
            const icon = marker.getIcon();
            if (icon && typeof icon.content === 'string') {
                const parser = new DOMParser();
                const doc = parser.parseFromString(icon.content, 'text/html');
                const studentCountSpan = doc.querySelector('.student_count');
                const schoolNameSpan = doc.querySelector('.school_name');
                const countContainer = doc.querySelector('.count_container');

                if (studentCountSpan) {
                    const studentText = (students != null && !isNaN(students)) ? `${students}명` : '?명';
                    studentCountSpan.textContent = studentText;
                } else { 
                    console.warn(`[ApplyFilter] student_count span not found for ${schoolName}`); 
                }

                if (schoolNameSpan) {
                    schoolNameSpan.style.color = (students != null && !isNaN(students) && students >= DYNAMIC_FILTER_MIN_STUDENTS) ? '#1a73e8' : '#e53935';
                    
                    // 공립/사립/국립 표시가 없으면 추가
                    let schoolTypeSpan = schoolNameSpan.querySelector('.school_type');
                    if (!schoolTypeSpan) {
                        let schoolTypeClass = 'school_type';
                        let schoolTypeText = '공립';
                        
                        if (schoolData.estType === '사립') {
                            schoolTypeClass = 'school_type private';
                            schoolTypeText = '사립';
                        } else if (schoolData.estType === '국립') {
                            schoolTypeClass = 'school_type national';
                            schoolTypeText = '국립';
                        }
                        schoolNameSpan.insertAdjacentHTML('beforeend', `<span class="${schoolTypeClass}">${schoolTypeText}</span>`);
                    }
                } else { 
                    console.warn(`[ApplyFilter] school_name span not found for ${schoolName}`); 
                }

                if (countContainer) {
                    const existingRateSpan = countContainer.querySelector('.comparison_rate'); 
                    if(existingRateSpan) existingRateSpan.remove();
                    const changeResult = calculateNextGradeChange(schoolData, selectedGrade);
                    const changeRateHtml = formatChangeRate(changeResult);
                    if (changeRateHtml) { 
                        countContainer.insertAdjacentHTML('beforeend', changeRateHtml); 
                    }
                } else { 
                    console.warn(`[ApplyFilter] count_container not found for ${schoolName}`); 
                }

                marker.setIcon({ 
                    content: doc.body.innerHTML, 
                    anchor: new naver.maps.Point(30, 15) 
                });

            } else { 
                console.warn(`[ApplyFilter] Invalid icon content for ${schoolName}:`, icon?.content); 
            }
        } catch (e) { 
            console.error(`[ApplyFilter] Error updating marker icon for ${schoolName}:`, e); 
        }

        // 학교 종류 필터 적용
        let typeVisible = true;
        if (!selectedSchoolTypes.includes('ALL')) {
            const schoolType = schoolData.estType || '공립';
            typeVisible = selectedSchoolTypes.includes(schoolType);
        }

        let visible = (students != null && !isNaN(students)) && students >= currentFilter && typeVisible;
        if (isZoomedOut) { 
            visible = visible && (students != null && !isNaN(students)) && (students >= DYNAMIC_FILTER_MIN_STUDENTS); 
        }
        marker.setVisible(visible);
        if (visible) visibleCount++;
    });

    let statusMessage = `${regionDisplayText} ${selectedGrade}학년: ${visibleCount}개교`;
    
    // 학교 종류 필터 상태 표시
    if (!selectedSchoolTypes.includes('ALL')) {
        const typeText = selectedSchoolTypes.join('/');
        statusMessage += ` (${typeText})`;
    }
    
    if (isZoomedOut && currentFilter < DYNAMIC_FILTER_MIN_STUDENTS) { 
        statusMessage += ` (줌 축소: ${DYNAMIC_FILTER_MIN_STUDENTS}명 이상)`; 
    } else if (isZoomedOut) { 
        statusMessage += ` (줌 축소 필터 활성)`; 
    }
    updateLoadingStatus(statusMessage);

    closeInfoDisplays();
    apartmentMarkers.forEach(m => m.setMap(null)); 
    apartmentMarkers = [];
    console.log("[ApplyFilter] Filter apply finished.");
}

// --- 필터 초기화 (학생 수 필터만) ---
function clearFilter() {
    const studentFilterInput = document.getElementById('student_filter');
    if (studentFilterInput) studentFilterInput.value = "0";
    if (!isDataLoaded) { 
        updateLoadingStatus("필터 초기화됨."); 
        return; 
    }
    if (searchResultsContainer) clearSchoolSearchResults();
    const regionDisplayText = currentlyDisplayedRegions ? currentlyDisplayedRegions.map(r => r.replace(/교육청|광역시|특별자치시|특별자치도|도|특별시/g,'')).join(',') : "전체";
    console.log(`Student filter cleared. Re-applying with Region(s) ${regionDisplayText}, Grade ${selectedGrade}, Filter 0.`);
    applyGradeAndFilter();
}

// --- 아파트 찾기 (findApartment) ---
function findApartment(element) {
    if (!isDataLoaded) return;
    try {
        const aptName = element.dataset.aptName; 
        const aptAddress = element.dataset.aptAddress; 
        if (!aptName) return;
        console.log(`Finding apt: ${aptName} ${aptAddress ? '('+aptAddress+')' : ''}`);
        closeInfoDisplays();
        const aptIdentifier = aptAddress ? (aptName + "||" + aptAddress) : aptName;
        const foundMarker = apartmentMarkers.find(marker => { 
            const markerApt = marker.aptData; 
            if (!markerApt) return false; 
            const markerId = markerApt.address ? `${markerApt.name}||${markerApt.address}` : markerApt.name; 
            return markerId === aptIdentifier; 
        });
        if (foundMarker) { 
            console.log("Apt marker found. Moving."); 
            map.panTo(foundMarker.getPosition()); 
            map.setZoom(16); 
            setTimeout(() => { 
                showApartmentDetails(foundMarker); 
            }, 300); 
        } else {
            console.log("Apt marker not found. Searching raw data and geocoding if needed.");
            let foundAptData = null;
            for (const school of rawSchoolData) { 
                if(school.apartments) { 
                    foundAptData = school.apartments.find(apt => (apt.address ? `${apt.name}||${apt.address}` : apt.name) === aptIdentifier); 
                    if(foundAptData) break; 
                } 
            }
            if (foundAptData) {
                console.log("Apt data found."); 
                const hasCoords = foundAptData.lat != null && foundAptData.lng != null;
                if (hasCoords) {
                    console.log("Coords found."); 
                    try { 
                        const position = new naver.maps.LatLng(foundAptData.lat, foundAptData.lng); 
                        map.panTo(position); 
                        map.setZoom(16); 
                        const newMarker = createApartmentMarker(foundAptData, position); 
                        if (newMarker) { 
                            apartmentMarkers.push(newMarker); 
                            setTimeout(() => { 
                                showApartmentDetails(newMarker); 
                            }, 300); 
                        } 
                    } catch (e) { 
                        console.error("Apt coord error:", e); 
                        if (foundAptData.address) requestGeocodeForApartment(foundAptData); 
                        else alert("Apt 위치 찾기 실패"); 
                    }
                } else if (foundAptData.address) { 
                    console.log("Coords not found, geocoding..."); 
                    requestGeocodeForApartment(foundAptData); 
                } else { 
                    alert(`Apt '${aptName}' 위치 정보 부족`); 
                }
            } else { 
                alert(`Apt '${aptName}' 정보 없음`); 
            }
        }
    } catch (error) { 
        console.error("findApartment error:", error); 
        alert("아파트 검색 오류"); 
    }
}

// --- 학교 검색 관련 함수 ---
function searchSchoolByName(query) {
    if (!isDataLoaded) return { type: 'none' };
    console.log(`Searching for school name: ${query}`);
    const baseQuery = query.replace(/초등학교|초$/,'').trim();
    let exactMatch = null;
    const partialMatches = [];
    schoolMarkers.forEach(marker => {
        if (!marker.schoolData || !marker.schoolData.name) return;
        const schoolName = marker.schoolData.name.trim();
        if (!marker.getVisible()) return;
        if (schoolName === query) { 
            exactMatch = marker; 
            return; 
        }
        if (schoolName.includes(baseQuery)) { 
            partialMatches.push(marker); 
        }
    });
    if (exactMatch) { 
        return { type: 'exact', marker: exactMatch }; 
    } else if (partialMatches.length === 1) { 
        return { type: 'single_partial', marker: partialMatches[0] }; 
    } else if (partialMatches.length > 1) { 
        partialMatches.sort((a, b) => a.schoolData.name.localeCompare(b.schoolData.name)); 
        return { type: 'multiple', results: partialMatches }; 
    } else { 
        return { type: 'none' }; 
    }
}

function displaySchoolSearchResults(results) {
    if (!searchResultsContainer) return;
    searchResultsContainer.innerHTML = '';
    const ul = document.createElement('ul');
    results.forEach(marker => {
        const li = document.createElement('li');
        li.textContent = marker.schoolData.name;
        if (marker.schoolData.eduOffice) {
            const officeSpan = document.createElement('span');
            officeSpan.className = 'edu-office';
            officeSpan.textContent = `(${marker.schoolData.eduOffice})`;
            li.appendChild(officeSpan);
        }
        li.dataset.schoolName = marker.schoolData.name;
        li.dataset.eduOffice = marker.schoolData.eduOffice || '';
        li.onclick = function() { 
            selectSchoolFromResults(this); 
        };
        ul.appendChild(li);
    });
    searchResultsContainer.appendChild(ul);
    searchResultsContainer.style.display = 'block';
}

function selectSchoolFromResults(element) { 
    const schoolName = element.dataset.schoolName; 
    const eduOffice = element.dataset.eduOffice; 
    findSchool(schoolName, eduOffice || null); 
}

// --- 학교 찾기 (findSchool) ---
function findSchool(schoolName, eduOffice = null) {
    if (!isDataLoaded) { 
        alert("학교 정보가 로드되지 않았습니다."); 
        return; 
    }
    closeInfoDisplays(); 
    clearSchoolSearchResults();
    console.log(`Finding school: ${schoolName} ${eduOffice ? '('+eduOffice+')' : ''}`);
    const foundMarker = schoolMarkers.find(marker => marker.schoolData && marker.schoolData.name === schoolName && (eduOffice === null || !marker.schoolData.eduOffice || marker.schoolData.eduOffice === eduOffice));
    if (foundMarker) {
        console.log(`School found: ${schoolName}. Moving map.`);
        map.panTo(foundMarker.getPosition()); 
        map.setZoom(16);
        if (!foundMarker.getVisible()) { 
            foundMarker.setVisible(true); 
        }
        setTimeout(() => { 
            showSchoolDetails(foundMarker); 
        }, 300);
        updateLoadingStatus(`학교 찾음: ${schoolName}`);
        closeFilterPanel();
    } else {
        const regionDisplayText = currentlyDisplayedRegions ? currentlyDisplayedRegions.map(r => r.replace(/교육청|광역시|특별자치시|특별자치도|도|특별시/g,'')).join(',') : "전체";
        alert(`학교 '${schoolName}' ${eduOffice ? '('+eduOffice+')' : ''} 위치를 현재 표시된 지역(${regionDisplayText})에서 찾을 수 없습니다.`);
        updateLoadingStatus(`학교 '${schoolName}' 찾기 실패 (${regionDisplayText})`);
    }
}

// --- 장소/학교 검색 ---
function searchLocation() {
    console.log("[searchLocation] Function called.");
    if (!searchResultsContainer) { 
        console.warn("Search results container not found."); 
    } else { 
        clearSchoolSearchResults(); 
    }
    const searchInput = document.getElementById('search_input');
    if (!searchInput) { 
        console.error("[searchLocation] Search input not found."); 
        return; 
    }
    const query = searchInput.value.trim();
    console.log("[searchLocation] Search query:", query);
    if (!query) { 
        alert("검색어를 입력해주세요."); 
        searchInput.focus(); 
        return; 
    }
    const regionDisplayText = currentlyDisplayedRegions ? currentlyDisplayedRegions.map(r => r.replace(/교육청|광역시|특별자치시|특별자치도|도|특별시/g,'')).join(',') : "전체";

    if (query.endsWith('초') || query.endsWith('초등학교')) {
        console.log("[searchLocation] Searching for school name...");
        setLoading(true, `학교 '${query}' 검색 중 (${regionDisplayText})...`);
        setTimeout(() => {
            const result = searchSchoolByName(query);
            console.log("[searchLocation] School search result:", result);
            setLoading(false);
            if (result.type === 'exact' || result.type === 'single_partial') {
                findSchool(result.marker.schoolData.name, result.marker.schoolData.eduOffice);
            } else if (result.type === 'multiple') {
                displaySchoolSearchResults(result.results);
                updateLoadingStatus(`${result.results.length}개 학교 검색됨. 선택해주세요.`);
            } else {
                alert(`'${query}'와(과) 일치하는 학교를 찾을 수 없습니다 (현재 표시된 ${regionDisplayText} 지역).`);
                updateLoadingStatus(`'${query}' 학교 검색 결과 없음 (${regionDisplayText})`);
            }
        }, 100);
    } else {
        console.log("[searchLocation] Searching for region/address...");
        setLoading(true, `'${query}' 위치 검색 중...`);
        naver.maps.Service.geocode({ query: query }, (status, response) => {
            setLoading(false);
            if (status === naver.maps.Service.Status.OK && response.v2.addresses.length > 0) {
                try {
                    const result = response.v2.addresses[0];
                    const point = new naver.maps.LatLng(result.y, result.x);
                    map.setCenter(point);
                    map.setZoom(15);
                    updateLoadingStatus(`'${query}' 위치로 이동했습니다.`);
                    console.log(`Map moved to searched location: ${query}`);
                    closeFilterPanel();
                } catch (e) {
                    console.error("Error processing geocode result:", e);
                    alert("검색 결과 처리 중 오류가 발생했습니다.");
                }
            } else {
                alert(`'${query}'에 대한 위치를 찾을 수 없습니다.`);
                updateLoadingStatus(`'${query}' 위치 검색 실패`);
                console.warn(`Geocoding failed for query: ${query}. Status: ${status}`);
            }
        });
    }
}

function clearSchoolSearchResults() {
    if (searchResultsContainer) {
        searchResultsContainer.style.display = 'none';
        searchResultsContainer.innerHTML = '';
    }
}

// --- 초기화 ---
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM content loaded. Checking for Naver Maps API...");
    
    function checkAndInitMap() {
        if (typeof naver !== 'undefined' && naver.maps && naver.maps.Map) {
            console.log("Naver Maps API is ready. Initializing map...");
            initMap();
        } else {
            console.log("Naver Maps API not ready yet. Retrying in 100ms...");
            setTimeout(checkAndInitMap, 100);
        }
    }
    
    checkAndInitMap();
});