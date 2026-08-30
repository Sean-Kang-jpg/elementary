#!/usr/bin/env python3
"""
Universal ETL Template for All Regions
Based on Seoul ETL's proven architecture
Supports all 5 regions with consistent field mapping and processing
"""

import requests
import json
import time
import re
import logging
from datetime import datetime
from typing import List, Dict, Optional
from urllib.parse import urlencode
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class KERISSchoolInfoExtractor:
    """KERIS 학교정보 API 데이터 추출 클래스"""

    def __init__(self, config: Dict = None):
        self.api_key = os.getenv('KERIS_SCHOOLINFO_API_KEY', '')
        self.api_endpoint = 'http://www.schoolinfo.go.kr/openApi.do'
        self.timeout = 30

        # 학교급 구분 코드
        self.school_type_codes = {
            'elementary': '02',  # 초등학교
            'middle': '03',      # 중학교
            'high': '04',        # 고등학교
        }

        # 기본 공시연도
        self.current_year = datetime.now().year

    def test_connection(self):
        """KERIS API 연결 테스트"""
        logger.info("KERIS API 연결 테스트")

        if not self.api_key:
            logger.error("KERIS API 키가 설정되지 않았습니다")
            return False

        try:
            test_params = {
                'apiKey': self.api_key,
                'apiType': '09',
                'pbanYr': 2024,
                'schulKndCode': '02',  # 초등학교
                'sidoCode': '00'
            }

            response = requests.get(
                self.api_endpoint,
                params=test_params,
                timeout=self.timeout
            )

            if response.status_code == 200:
                try:
                    data = response.json()
                    if data.get('resultCode') == 'success':
                        logger.info("KERIS API 연결 성공!")
                        return True
                    else:
                        logger.warning(f"API 호출 실패: {data.get('resultMsg', 'Unknown error')}")
                        return False
                except json.JSONDecodeError:
                    logger.warning("API 응답이 JSON 형식이 아닙니다")
                    return False
            else:
                logger.error(f"API 호출 실패: HTTP {response.status_code}")
                return False

        except Exception as e:
            logger.error(f"KERIS API 연결 실패: {e}")
            return False

    def extract_all_schools(self, region_code: str = '00', year: int = None) -> List[Dict]:
        """전체 학교 목록을 가져옵니다"""
        if year is None:
            year = 2024  # 고정된 연도 사용

        logger.info(f"KERIS 전체 학교 목록 수집 시작: 연도={year}, 지역={region_code}")

        params = {
            'apiKey': self.api_key,
            'apiType': '09',
            'pbanYr': year,
            'schulKndCode': '02',  # 초등학교
            'sidoCode': region_code
        }

        try:
            response = requests.get(
                self.api_endpoint,
                params=params,
                timeout=self.timeout
            )

            if response.status_code != 200:
                logger.error(f"KERIS API 호출 실패: HTTP {response.status_code}")
                return []

            try:
                data = response.json()
                return self._parse_all_schools_data(data, region_code)

            except json.JSONDecodeError as e:
                logger.error(f"KERIS JSON 파싱 실패: {e}")
                return []

        except requests.RequestException as e:
            logger.error(f"KERIS API 요청 실패: {e}")
            return []
        except Exception as e:
            logger.error(f"KERIS 예상치 못한 오류: {e}")
            return []

    def _parse_all_schools_data(self, data: Dict, region_code: str) -> List[Dict]:
        """KERIS 전체 학교 목록 데이터 파싱"""
        try:
            result_code = data.get('resultCode', '')
            result_msg = data.get('resultMsg', '')

            logger.info(f"KERIS API 응답: {result_code} - {result_msg}")

            if result_code == 'fail':
                logger.error(f"KERIS API 호출 실패: {result_msg}")
                return []

            if 'list' in data:
                school_list = data['list']

                if not isinstance(school_list, list):
                    logger.warning(f"예상치 못한 list 구조: {type(school_list)}")
                    return []

                logger.info(f"KERIS에서 수집된 학교 수: {len(school_list)}")

                schools = []
                for school_info in school_list:
                    school_data = {
                        'school_code': school_info.get('SCHUL_CODE', ''),
                        'region_code': region_code,
                        'school_name': school_info.get('SCHUL_NM', ''),
                        'education_office': school_info.get('ATPT_OFCDC_ORG_NM', ''),
                        'education_support_office': school_info.get('JU_ORG_NM', ''),
                        'district_name': school_info.get('ADRCD_NM', ''),
                        'address_code': school_info.get('ADRCD_CD', ''),
                        'grade1_classes': self._safe_int(school_info.get('COL_C1', 0)),
                        'grade1_students': self._safe_int(school_info.get('COL_S1', 0)),
                        'grade1_per_class': self._safe_float(school_info.get('COL_1', 0)),
                        'grade2_classes': self._safe_int(school_info.get('COL_C2', 0)),
                        'grade2_students': self._safe_int(school_info.get('COL_S2', 0)),
                        'grade2_per_class': self._safe_float(school_info.get('COL_2', 0)),
                        'grade3_classes': self._safe_int(school_info.get('COL_C3', 0)),
                        'grade3_students': self._safe_int(school_info.get('COL_S3', 0)),
                        'grade3_per_class': self._safe_float(school_info.get('COL_3', 0)),
                        'grade4_classes': self._safe_int(school_info.get('COL_C4', 0)),
                        'grade4_students': self._safe_int(school_info.get('COL_S4', 0)),
                        'grade4_per_class': self._safe_float(school_info.get('COL_4', 0)),
                        'grade5_classes': self._safe_int(school_info.get('COL_C5', 0)),
                        'grade5_students': self._safe_int(school_info.get('COL_S5', 0)),
                        'grade5_per_class': self._safe_float(school_info.get('COL_5', 0)),
                        'grade6_classes': self._safe_int(school_info.get('COL_C6', 0)),
                        'grade6_students': self._safe_int(school_info.get('COL_S6', 0)),
                        'grade6_per_class': self._safe_float(school_info.get('COL_6', 0)),
                        'total_students': self._safe_int(school_info.get('COL_S_SUM', 0)),
                        'teachers': self._safe_int(school_info.get('TCH_CO', 0)),
                        'updated_at': datetime.now().isoformat()
                    }

                    # 총 학생수가 0인 경우 학년별 합계로 계산
                    if school_data['total_students'] == 0:
                        school_data['total_students'] = sum([
                            school_data['grade1_students'], school_data['grade2_students'],
                            school_data['grade3_students'], school_data['grade4_students'],
                            school_data['grade5_students'], school_data['grade6_students']
                        ])

                    schools.append(school_data)

                return schools
            else:
                logger.warning("KERIS 응답에 list 노드가 없습니다")
                return []

        except Exception as e:
            logger.error(f"KERIS 전체 학교 데이터 파싱 실패: {e}")
            return []

    def _safe_int(self, value) -> int:
        """안전한 정수 변환"""
        try:
            if value is None or value == '':
                return 0
            return int(float(str(value)))
        except (ValueError, TypeError):
            return 0

    def _safe_float(self, value) -> float:
        """안전한 실수 변환"""
        try:
            if value is None or value == '':
                return 0.0
            return float(str(value))
        except (ValueError, TypeError):
            return 0.0

# Regional Configurations
REGION_CONFIGS = {
    'seoul': {
        'region': 'seoul',
        'region_kr': '서울특별시',
        'neis_office': 'B10',
        'keris_region_code': '11',  # Seoul specific code for KERIS
        'address_patterns': ['서울특별시', '서울시'],
        'districts': [
            '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구',
            '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구',
            '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'
        ],
        'coordinate_bounds': {'lat_min': 37.4, 'lat_max': 37.7, 'lng_min': 126.8, 'lng_max': 127.2},
        'expected_schools': 600,
        'batch_size': 200
    },
    'gyeonggi': {
        'region': 'gyeonggi',
        'region_kr': '경기도',
        'neis_office': 'J10',
        'address_patterns': ['경기도'],
        'municipalities': [
            '수원시', '성남시', '고양시', '용인시', '부천시', '안산시', '안양시', '남양주시',
            '화성시', '평택시', '의정부시', '시흥시', '파주시', '광명시', '김포시', '군포시',
            '이천시', '양주시', '오산시', '구리시', '안성시', '포천시', '의왕시', '하남시',
            '여주시', '동두천시', '과천시', '광주시', '연천군', '가평군', '양평군'
        ],
        'coordinate_bounds': {'lat_min': 36.8, 'lat_max': 38.2, 'lng_min': 126.5, 'lng_max': 127.8},
        'expected_schools': 1200,
        'batch_size': 500
    },
    'incheon': {
        'region': 'incheon',
        'region_kr': '인천광역시',
        'neis_office': 'E10',
        'address_patterns': ['인천광역시', '인천시', '인천'],
        'districts': [
            '중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구', '강화군', '옹진군'
        ],
        'coordinate_bounds': {'lat_min': 37.2, 'lat_max': 37.8, 'lng_min': 126.1, 'lng_max': 126.9},
        'expected_schools': 280,
        'batch_size': 140
    },
    'daegu': {
        'region': 'daegu',
        'region_kr': '대구광역시',
        'neis_office': 'D10',
        'address_patterns': ['대구광역시', '대구시', '대구'],
        'districts': [
            '중구', '동구', '서구', '남구', '북구', '수성구', '달서구', '달성군', '군위군'
        ],
        'coordinate_bounds': {'lat_min': 35.6, 'lat_max': 36.0, 'lng_min': 128.3, 'lng_max': 129.0},
        'expected_schools': 250,
        'batch_size': 125
    },
    'busan': {
        'region': 'busan',
        'region_kr': '부산광역시',
        'neis_office': 'C10',
        'address_patterns': ['부산광역시', '부산시', '부산'],
        'districts': [
            '중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구', '해운대구',
            '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군'
        ],
        'coordinate_bounds': {'lat_min': 35.0, 'lat_max': 35.4, 'lng_min': 128.8, 'lng_max': 129.4},
        'expected_schools': 300,
        'batch_size': 150
    }
}

class UniversalETL:
    def __init__(self, region: str):
        if region not in REGION_CONFIGS:
            raise ValueError(f"Unsupported region: {region}. Supported: {list(REGION_CONFIGS.keys())}")

        self.region = region
        self.config = REGION_CONFIGS[region]
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': f'{region.title()}-ETL-Pipeline/1.0'
        })

        # Results storage
        self.datagokr_schools = []
        self.neis_schools = []
        self.keris_schools = []
        self.integrated_schools = []

        # Initialize KERIS extractor
        self.keris_extractor = KERISSchoolInfoExtractor()

        # Metrics
        self.metrics = {
            'start_time': None,
            'end_time': None,
            'processing_time': 0,
            'success_count': 0,
            'error_count': 0,
            'integration_rate': 0
        }

    def log(self, message: str, level: str = "INFO"):
        """Enhanced logging with timestamps"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")

    def collect_datagokr_schools(self) -> List[Dict]:
        """Collect all elementary schools from data.go.kr API"""
        self.log("Starting data.go.kr school collection...")

        all_schools = []
        page = 1
        max_pages = 20  # Safety limit

        while page <= max_pages:
            self.log(f"Fetching data.go.kr page {page}...")

            params = {
                'serviceKey': os.getenv('DATA_GO_KR_DECODED_KEY'),
                'pageNo': str(page),
                'numOfRows': '1000',
                'type': 'json',
                'schoolSe': '초등학교'
            }

            try:
                response = self.session.get(
                    os.getenv('DATA_GO_KR_URL'),
                    params=params,
                    timeout=30
                )

                if response.status_code == 200:
                    data = response.json()

                    if 'response' in data:
                        header = data['response'].get('header', {})
                        result_code = header.get('resultCode')

                        if result_code == "00":
                            body = data['response'].get('body', {})
                            items = body.get('items', [])
                            total_count = body.get('totalCount', 0)

                            if isinstance(items, list) and items:
                                all_schools.extend(items)
                                self.log(f"Page {page}: {len(items)} schools (total: {len(all_schools)}/{total_count})")

                                # Check if we have all data
                                try:
                                    total_count_int = int(total_count)
                                    if len(all_schools) >= total_count_int:
                                        self.log(f"All data collected: {len(all_schools)} schools")
                                        break
                                except (ValueError, TypeError):
                                    if str(len(all_schools)) >= str(total_count):
                                        self.log(f"All data collected (fallback): {len(all_schools)} schools")
                                        break
                            else:
                                self.log(f"No more schools on page {page}")
                                break
                        else:
                            self.log(f"API Error: {header.get('resultMsg')}", "ERROR")
                            break
                else:
                    self.log(f"HTTP Error: {response.status_code}", "ERROR")
                    break

            except Exception as e:
                self.log(f"Request failed: {str(e)}", "ERROR")
                break

            page += 1
            time.sleep(1)  # Rate limiting

        self.log(f"data.go.kr collection complete: {len(all_schools)} total schools")
        return all_schools

    def filter_regional_schools(self, schools: List[Dict]) -> List[Dict]:
        """Filter schools by regional address patterns with strict validation"""
        self.log(f"Filtering {self.region} schools by address patterns...")

        regional_schools = []
        address_patterns = self.config['address_patterns']

        # Get regional administrative divisions
        admin_divisions = self.config.get('districts', []) + self.config.get('municipalities', [])

        for school in schools:
            address = school.get('rdnmadr', '') or school.get('lnmadr', '')

            if address:
                is_target_region = False

                # Primary check: Regional administrative divisions in address
                for division in admin_divisions:
                    if division in address:
                        is_target_region = True
                        break

                # Secondary check: Regional patterns
                if not is_target_region:
                    for pattern in address_patterns:
                        if pattern in address or address.startswith(pattern):
                            is_target_region = True
                            break

                # Exclude other regions (only for metropolitan cities)
                if self.region in ['seoul', 'incheon', 'daegu', 'busan']:
                    other_regions = [
                        '서울특별시', '서울시', '인천광역시', '인천시', '대구광역시', '대구시',
                        '광주광역시', '광주시', '대전광역시', '대전시', '울산광역시', '울산시', '세종시',
                        '경기도', '강원도', '충청북도', '충청남도', '전라북도', '전라남도',
                        '경상북도', '경상남도', '제주도', '제주특별자치도'
                    ]
                    # Remove current region patterns from exclusion list
                    other_regions = [r for r in other_regions if r not in address_patterns]

                    for pattern in other_regions:
                        # Use more precise matching to avoid false positives
                        # Check if the pattern appears as a complete administrative unit
                        if (pattern + ' ') in (address + ' ') or address.startswith(pattern):
                            is_target_region = False
                            break

                if is_target_region:
                    regional_schools.append(school)

        self.log(f"{self.region.title()} filtering complete: {len(regional_schools)} schools found")

        # Sample some addresses to verify filtering
        if regional_schools:
            self.log(f"Sample {self.region} addresses:")
            for i, school in enumerate(regional_schools[:5]):
                addr = school.get('rdnmadr', '') or school.get('lnmadr', '')
                name = school.get('schoolNm', 'N/A')
                self.log(f"  {i+1}. {name} | {addr}")

        return regional_schools

    def collect_neis_schools(self) -> List[Dict]:
        """Collect regional schools from NEIS API"""
        self.log(f"Starting NEIS school collection for {self.region}...")

        all_schools = []
        page = 1
        max_pages = 20  # Safety limit

        while page <= max_pages:
            self.log(f"Fetching NEIS page {page}...")

            params = {
                'Key': os.getenv('NEIS_SCHOOL_API_KEY'),
                'Type': 'json',
                'pIndex': str(page),
                'pSize': '100',
                'ATPT_OFCDC_SC_CODE': self.config['neis_office'],
                'SCHUL_KND_SC_NM': '초등학교'
            }

            try:
                response = self.session.get(
                    'https://open.neis.go.kr/hub/schoolInfo',
                    params=params,
                    timeout=30
                )

                if response.status_code == 200:
                    data = response.json()

                    if 'schoolInfo' in data and len(data['schoolInfo']) > 1:
                        schools = data['schoolInfo'][1]['row']
                        all_schools.extend(schools)
                        self.log(f"NEIS page {page}: {len(schools)} schools (total: {len(all_schools)})")

                        # Continue if we got full page
                        if len(schools) < 100:
                            self.log("Last page reached")
                            break
                    else:
                        # Check for error message
                        if 'RESULT' in data:
                            error_msg = data['RESULT'].get('MESSAGE', 'Unknown error')
                            self.log(f"NEIS Error: {error_msg}", "ERROR")
                        break
                else:
                    self.log(f"NEIS HTTP Error: {response.status_code}", "ERROR")
                    break

            except Exception as e:
                self.log(f"NEIS request failed: {str(e)}", "ERROR")
                break

            page += 1
            time.sleep(2)  # Rate limiting

        self.log(f"NEIS collection complete: {len(all_schools)} {self.region} schools")
        return all_schools

    def normalize_address(self, address: str) -> str:
        """Normalize address for comparison"""
        if not address:
            return ""

        normalized = address

        # Standardize regional names
        if self.region == 'seoul':
            normalized = normalized.replace('서울시', '서울특별시')
            normalized = normalized.replace('서울', '서울특별시')
        elif self.region == 'gyeonggi':
            normalized = normalized.replace('경기', '경기도')
        elif self.region in ['incheon', 'daegu', 'busan']:
            region_map = {
                'incheon': ('인천시', '인천광역시'),
                'daegu': ('대구시', '대구광역시'),
                'busan': ('부산시', '부산광역시')
            }
            old_name, new_name = region_map[self.region]
            normalized = normalized.replace(old_name, new_name)

        # Clean up spaces and special characters
        normalized = re.sub(r'\s+', ' ', normalized)
        normalized = re.sub(r'[()（）]', '', normalized)
        normalized = re.sub(r'\d{5,6}\s*', '', normalized)  # Remove postal codes

        return normalized.strip()

    def normalize_school_name(self, name: str) -> str:
        """Normalize school name for comparison"""
        if not name:
            return ""

        normalized = name.strip()

        # Remove common prefixes/suffixes
        normalized = re.sub(r'^(사립|공립|국립)\s*', '', normalized)
        normalized = re.sub(r'\s*(초등학교|초교|분교장?)$', '', normalized)

        # Handle special cases
        normalized = re.sub(r'\s+', '', normalized)  # Remove spaces

        # Standardize similar patterns
        if normalized.endswith('초'):
            normalized = normalized[:-1] + '초등학교'
        elif normalized.endswith('초교'):
            normalized = normalized.replace('초교', '초등학교')

        return normalized.strip()

    def calculate_similarity(self, name1: str, name2: str) -> float:
        """Calculate name similarity score"""
        name1_norm = self.normalize_school_name(name1).lower()
        name2_norm = self.normalize_school_name(name2).lower()

        if name1_norm == name2_norm:
            return 1.0

        # Simple substring matching
        if name1_norm in name2_norm or name2_norm in name1_norm:
            return 0.8

        # Character overlap
        set1 = set(name1_norm)
        set2 = set(name2_norm)
        intersection = len(set1 & set2)
        union = len(set1 | set2)

        if union == 0:
            return 0.0

        return intersection / union

    def find_neis_match(self, datagokr_school: Dict, neis_schools: List[Dict]) -> Optional[Dict]:
        """Find best NEIS match for a data.go.kr school"""
        datagokr_name = datagokr_school.get('schoolNm', '')
        datagokr_addr = self.normalize_address(datagokr_school.get('rdnmadr', ''))

        best_match = None
        best_score = 0.0

        for neis_school in neis_schools:
            neis_name = neis_school.get('SCHUL_NM', '')
            neis_addr = self.normalize_address(neis_school.get('ORG_RDNMA', ''))

            # Calculate name similarity
            name_score = self.calculate_similarity(datagokr_name, neis_name)

            # Address bonus for regional divisions
            addr_bonus = 0.0
            if datagokr_addr and neis_addr:
                admin_divisions = self.config.get('districts', []) + self.config.get('municipalities', [])
                for division in admin_divisions:
                    if division in datagokr_addr and division in neis_addr:
                        addr_bonus = 0.1
                        break

            total_score = name_score + addr_bonus

            if total_score > best_score and total_score >= 0.7:  # Minimum threshold
                best_score = total_score
                best_match = neis_school

        return best_match

    def collect_neis_schools(self) -> List[Dict]:
        """Collect NEIS schools data (placeholder)"""
        self.log("NEIS collection not implemented yet - returning empty list")
        return []

    def collect_keris_schools(self) -> List[Dict]:
        """Collect KERIS school class information"""
        self.log("Starting KERIS school class information collection...")

        # Test KERIS connection first
        if not self.keris_extractor.test_connection():
            self.log("KERIS API connection failed - continuing without class data", "WARNING")
            return []

        # Get region-specific code for KERIS (different from NEIS office code)
        keris_region_code = self.config.get('keris_region_code', '00')
        self.log(f"Using KERIS region code: {keris_region_code}")

        try:
            # Use 2025 data (latest available)
            keris_schools = []
            year = 2025
            self.log(f"Collecting KERIS API data for year {year}...")
            keris_schools = self.keris_extractor.extract_all_schools(region_code=keris_region_code, year=year)
            if keris_schools:
                self.log(f"Successfully collected KERIS data for year {year}")
            else:
                self.log(f"No KERIS data found for year {year}")

            if not keris_schools:
                self.log("Trying KERIS API with region code '00' (all regions)...")
                keris_schools = self.keris_extractor.extract_all_schools(region_code='00')

            if keris_schools:
                self.log(f"KERIS collection successful: {len(keris_schools)} schools with class data")

                # Log sample data for verification
                if len(keris_schools) > 0:
                    sample = keris_schools[0]
                    self.log(f"Sample KERIS data: {sample.get('school_name', 'N/A')} - Grade 1: {sample.get('grade1_students', 0)} students")
            else:
                self.log("No KERIS data collected", "WARNING")

            return keris_schools

        except Exception as e:
            self.log(f"KERIS collection failed: {str(e)}", "ERROR")
            return []

    def extract_district_from_address(self, address: str) -> str:
        """Extract district (구/군) from address"""
        if not address:
            return ""

        import re
        # 서울특별시 구 패턴
        district_pattern = r'(강남구|강동구|강북구|강서구|관악구|광진구|구로구|금천구|노원구|도봉구|동대문구|동작구|마포구|서대문구|서초구|성동구|성북구|송파구|양천구|영등포구|용산구|은평구|종로구|중구|중랑구)'
        match = re.search(district_pattern, address)
        return match.group(1) if match else ""

    def find_keris_match_with_region(self, datagokr_school: Dict, keris_schools: List[Dict], used_keris_codes: set) -> Optional[Dict]:
        """Find KERIS match using education office + district + school name"""
        datagokr_name = datagokr_school.get('school_name', '')
        datagokr_education_office = datagokr_school.get('education_office', '')
        datagokr_address = datagokr_school.get('address', '')
        datagokr_district = self.extract_district_from_address(datagokr_address)

        candidates = []

        for keris_school in keris_schools:
            # Skip if already used
            keris_code = keris_school.get('school_code', '')
            if keris_code in used_keris_codes:
                continue

            keris_name = keris_school.get('school_name', '')
            keris_education_office = keris_school.get('region_code', '')  # This should be education office
            keris_district_addr = keris_school.get('district_name', '')  # Will add this field

            # Calculate name similarity
            name_score = self.calculate_similarity(datagokr_name, keris_name)
            if name_score < 0.9:  # Stricter threshold
                continue

            # Education office bonus (if available)
            education_bonus = 0.0
            if datagokr_education_office and "서울특별시교육청" in datagokr_education_office:
                education_bonus = 0.05

            # District bonus
            district_bonus = 0.0
            if datagokr_district and keris_district_addr and datagokr_district in keris_district_addr:
                district_bonus = 0.05

            total_score = name_score + education_bonus + district_bonus
            candidates.append((total_score, keris_school))

        # Return best candidate
        if candidates:
            candidates.sort(key=lambda x: x[0], reverse=True)
            best_score, best_match = candidates[0]
            if best_score >= 0.9:  # Minimum threshold
                return best_match

        return None

    def integrate_school_data_with_keris(self, datagokr_schools: List[Dict], neis_schools: List[Dict], keris_schools: List[Dict]) -> List[Dict]:
        """Integrate data from all three sources with improved KERIS matching"""
        self.log("Starting school data integration with improved KERIS matching...")

        integrated = []
        matched_count = 0
        keris_matched_count = 0
        used_keris_codes = set()  # Track used KERIS schools

        # Enhanced KERIS data preprocessing
        enhanced_keris_schools = []
        for keris_school in keris_schools:
            enhanced_school = keris_school.copy()
            # Extract district from KERIS address name if available
            adrcd_nm = keris_school.get('district_name', '')  # Will need to map this properly
            enhanced_school['district_name'] = adrcd_nm
            enhanced_keris_schools.append(enhanced_school)

        self.log(f"Enhanced KERIS data with {len(enhanced_keris_schools)} schools")

        for i, datagokr_school in enumerate(datagokr_schools):
            if i % 50 == 0:
                self.log(f"Processing school {i+1}/{len(datagokr_schools)}")

            # Find NEIS match (placeholder for now)
            neis_match = self.find_neis_match(datagokr_school, neis_schools)

            # Start with data.go.kr as base (has coordinates)
            integrated_school = {
                'source': 'data.go.kr',
                'school_id': datagokr_school.get('schoolId'),
                'school_name': datagokr_school.get('schoolNm'),
                'school_type': datagokr_school.get('schoolSe'),
                'address': datagokr_school.get('rdnmadr'),
                'address_old': datagokr_school.get('lnmadr'),
                'latitude': datagokr_school.get('latitude'),
                'longitude': datagokr_school.get('longitude'),
                'establishment_date': datagokr_school.get('fondDate'),
                'establishment_type': datagokr_school.get('fondType'),
                'operation_status': datagokr_school.get('operSttus'),
                'education_office': datagokr_school.get('cddcNm'),
                'education_support_office': datagokr_school.get('edcSportNm'),  # Add education support office
                'reference_date': datagokr_school.get('referenceDate'),

                # Initialize NEIS fields
                'neis_school_code': None,
                'neis_matched': False,
                'homepage': None,
                'phone': None,
                'fax': None,
                'local_education_office': None,
                'postal_code': None,
                'english_name': None,
                'coedu_type': None,
                'foundation_type': None,
                # Region info
                'region': self.config['region_kr'],
                'province': self.config['region_kr'],

                # Initialize KERIS class information fields
                'keris_matched': False,
                'grade1_classes': 0,
                'grade1_students': 0,
                'grade1_per_class': 0.0,
                'grade2_classes': 0,
                'grade2_students': 0,
                'grade2_per_class': 0.0,
                'grade3_classes': 0,
                'grade3_students': 0,
                'grade3_per_class': 0.0,
                'grade4_classes': 0,
                'grade4_students': 0,
                'grade4_per_class': 0.0,
                'grade5_classes': 0,
                'grade5_students': 0,
                'grade5_per_class': 0.0,
                'grade6_classes': 0,
                'grade6_students': 0,
                'grade6_per_class': 0.0,
                'total_students': 0,
                'teachers': 0
            }

            # Add NEIS data if matched
            if neis_match:
                integrated_school.update({
                    'neis_school_code': neis_match.get('neiSchulCode'),
                    'neis_matched': True,
                    'homepage': neis_match.get('hmpgAdres'),
                    'phone': neis_match.get('cntctTelNo'),
                    'fax': neis_match.get('faxNo'),
                    'local_education_office': neis_match.get('atptOfcdcNm'),
                    'postal_code': neis_match.get('zipCode'),
                    'english_name': neis_match.get('engSchulNm'),
                    'coedu_type': neis_match.get('coedRecpSe'),
                    'foundation_type': neis_match.get('fondType')
                })
                matched_count += 1

            # Add KERIS class data with improved matching (name + education office)
            keris_match = None
            datagokr_name = integrated_school.get('school_name', '')
            datagokr_education_office = integrated_school.get('education_office', '')

            for keris_school in enhanced_keris_schools:
                keris_code = keris_school.get('school_code', '')

                # Skip if already used (1:1 mapping)
                if keris_code in used_keris_codes:
                    continue

                keris_name = keris_school.get('school_name', '')
                keris_education_office = keris_school.get('education_office', '')

                # Check name similarity (stricter threshold: 0.9)
                name_similarity = self.calculate_similarity(datagokr_name, keris_name)
                if name_similarity < 0.9:
                    continue

                # Check education support office matching (more specific than education office)
                education_office_match = True

                # Get education support office from data.go.kr (edcSportNm field)
                datagokr_support_office = integrated_school.get('education_support_office', '')
                keris_support_office = keris_school.get('education_support_office', '')

                # If both have education support office info, they must match
                if datagokr_support_office and keris_support_office:
                    # Normalize names for comparison
                    datagokr_normalized = datagokr_support_office.replace('서울특별시', '').replace('교육지원청', '').strip()
                    keris_normalized = keris_support_office.replace('서울특별시', '').replace('교육지원청', '').strip()

                    # Handle abbreviations (e.g., 노북 = 노원북부)
                    education_office_match = False

                    # Direct match
                    if datagokr_normalized in keris_normalized or keris_normalized in datagokr_normalized:
                        education_office_match = True
                    # Handle common abbreviations
                    elif keris_normalized == '노북' and '노원북부' in datagokr_normalized:
                        education_office_match = True
                    elif keris_normalized == '중부' and '중부' in datagokr_normalized:
                        education_office_match = True

                    if not education_office_match:
                        continue  # Skip if education support offices don't match

                if education_office_match:
                    keris_match = keris_school
                    used_keris_codes.add(keris_code)  # Mark as used immediately
                    break

            if keris_match:
                integrated_school.update({
                    'keris_matched': True,
                    'grade1_classes': keris_match.get('grade1_classes', 0),
                    'grade1_students': keris_match.get('grade1_students', 0),
                    'grade1_per_class': keris_match.get('grade1_per_class', 0.0),
                    'grade2_classes': keris_match.get('grade2_classes', 0),
                    'grade2_students': keris_match.get('grade2_students', 0),
                    'grade2_per_class': keris_match.get('grade2_per_class', 0.0),
                    'grade3_classes': keris_match.get('grade3_classes', 0),
                    'grade3_students': keris_match.get('grade3_students', 0),
                    'grade3_per_class': keris_match.get('grade3_per_class', 0.0),
                    'grade4_classes': keris_match.get('grade4_classes', 0),
                    'grade4_students': keris_match.get('grade4_students', 0),
                    'grade4_per_class': keris_match.get('grade4_per_class', 0.0),
                    'grade5_classes': keris_match.get('grade5_classes', 0),
                    'grade5_students': keris_match.get('grade5_students', 0),
                    'grade5_per_class': keris_match.get('grade5_per_class', 0.0),
                    'grade6_classes': keris_match.get('grade6_classes', 0),
                    'grade6_students': keris_match.get('grade6_students', 0),
                    'grade6_per_class': keris_match.get('grade6_per_class', 0.0),
                    'total_students': keris_match.get('total_students', 0),
                    'teachers': keris_match.get('teachers', 0)
                })
                keris_matched_count += 1

            integrated.append(integrated_school)

        self.log(f"Integration complete: {len(integrated)} schools processed")
        self.log(f"NEIS matches: {matched_count} ({matched_count/len(integrated)*100:.1f}%)")
        self.log(f"KERIS matches: {keris_matched_count} ({keris_matched_count/len(integrated)*100:.1f}%)")

        return integrated

    def integrate_school_data(self, datagokr_schools: List[Dict], neis_schools: List[Dict]) -> List[Dict]:
        """Integrate data from both sources using Seoul ETL proven method"""
        self.log("Starting school data integration...")

        integrated = []
        matched_count = 0

        for i, datagokr_school in enumerate(datagokr_schools):
            if i % 50 == 0:
                self.log(f"Processing school {i+1}/{len(datagokr_schools)}")

            # Find NEIS match
            neis_match = self.find_neis_match(datagokr_school, neis_schools)

            # Start with data.go.kr as base (has coordinates) - Seoul ETL method
            integrated_school = {
                'source': 'data.go.kr',
                'school_id': datagokr_school.get('schoolId'),
                'school_name': datagokr_school.get('schoolNm'),
                'school_type': datagokr_school.get('schoolSe'),
                'address': datagokr_school.get('rdnmadr'),
                'address_old': datagokr_school.get('lnmadr'),
                'latitude': datagokr_school.get('latitude'),
                'longitude': datagokr_school.get('longitude'),
                'establishment_date': datagokr_school.get('fondDate'),
                'establishment_type': datagokr_school.get('fondType'),
                'operation_status': datagokr_school.get('operSttus'),
                'education_office': datagokr_school.get('cddcNm'),
                'reference_date': datagokr_school.get('referenceDate'),
                # Initialize NEIS fields
                'neis_school_code': None,
                'neis_matched': False,
                'homepage': None,
                'phone': None,
                'fax': None,
                # Region info
                'region': self.config['region_kr'],
                'province': self.config['region_kr']
            }

            # Add NEIS data if matched
            if neis_match:
                integrated_school.update({
                    'neis_school_code': neis_match.get('SD_SCHUL_CODE'),
                    'neis_matched': True,
                    'homepage': neis_match.get('HMPG_ADRES'),
                    'phone': neis_match.get('ENT_YMD'),
                    'fax': neis_match.get('FOAS_MEMRD')
                })
                matched_count += 1

            integrated.append(integrated_school)

        integration_rate = (matched_count / len(datagokr_schools)) * 100 if datagokr_schools else 0
        self.log(f"Integration complete: {matched_count}/{len(datagokr_schools)} matched ({integration_rate:.1f}%)")

        return integrated

    def validate_data_quality(self, schools: List[Dict]) -> Dict:
        """Validate data quality and generate metrics"""
        self.log("Starting data quality validation...")

        metrics = {
            'total_schools': len(schools),
            'coordinate_coverage': 0,
            'address_completeness': 0,
            'neis_integration_rate': 0,
            'regional_coverage': set(),
            'quality_issues': []
        }

        coordinate_count = 0
        address_count = 0
        neis_matched_count = 0

        bounds = self.config['coordinate_bounds']

        for school in schools:
            # Check coordinates
            lat = school.get('latitude')
            lng = school.get('longitude')
            if lat and lng and lat != 'N/A' and lng != 'N/A':
                try:
                    lat_f = float(lat)
                    lng_f = float(lng)
                    # Regional bounds check
                    if (bounds['lat_min'] <= lat_f <= bounds['lat_max'] and
                        bounds['lng_min'] <= lng_f <= bounds['lng_max']):
                        coordinate_count += 1
                    else:
                        metrics['quality_issues'].append(f"School outside {self.region} bounds: {school.get('school_name')}")
                except:
                    metrics['quality_issues'].append(f"Invalid coordinates: {school.get('school_name')}")

            # Check address
            address = school.get('address')
            if address and address.strip():
                address_count += 1

                # Extract regional divisions
                admin_divisions = self.config.get('districts', []) + self.config.get('municipalities', [])
                for division in admin_divisions:
                    if division in address:
                        metrics['regional_coverage'].add(division)
                        break

            # Check NEIS integration
            if school.get('neis_matched'):
                neis_matched_count += 1

        # Calculate percentages
        if len(schools) > 0:
            metrics['coordinate_coverage'] = (coordinate_count / len(schools)) * 100
            metrics['address_completeness'] = (address_count / len(schools)) * 100
            metrics['neis_integration_rate'] = (neis_matched_count / len(schools)) * 100

        # Convert set to list for JSON serialization
        metrics['regional_coverage'] = list(metrics['regional_coverage'])

        self.log("Data quality validation complete:")
        self.log(f"  Total schools: {metrics['total_schools']}")
        self.log(f"  Coordinate coverage: {metrics['coordinate_coverage']:.1f}%")
        self.log(f"  Address completeness: {metrics['address_completeness']:.1f}%")
        self.log(f"  NEIS integration: {metrics['neis_integration_rate']:.1f}%")
        self.log(f"  Regional coverage: {len(metrics['regional_coverage'])} divisions - {metrics['regional_coverage']}")

        if metrics['quality_issues']:
            self.log(f"  Quality issues: {len(metrics['quality_issues'])}")
            for issue in metrics['quality_issues'][:5]:  # Show first 5
                self.log(f"    - {issue}")

        return metrics

    def save_results(self, schools: List[Dict], metrics: Dict):
        """Save results to JSON files"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Save schools data
        schools_filename = f"{self.region}_integrated_schools_{timestamp}.json"
        with open(schools_filename, 'w', encoding='utf-8') as f:
            json.dump(schools, f, ensure_ascii=False, indent=2)
        self.log(f"Schools data saved: {schools_filename}")

        # Save metrics
        metrics_filename = f"{self.region}_etl_metrics_{timestamp}.json"
        with open(metrics_filename, 'w', encoding='utf-8') as f:
            json.dump(metrics, f, ensure_ascii=False, indent=2)
        self.log(f"Metrics saved: {metrics_filename}")

    def run_etl(self) -> Dict:
        """Run complete ETL process for the region"""
        self.metrics['start_time'] = datetime.now()

        try:
            print("=" * 60)
            self.log(f"STARTING {self.region.upper()} ETL IMPLEMENTATION")
            print("=" * 60)

            # Step 1: Collect from data.go.kr
            self.log(f"\n--- STEP 1: DATA.GO.KR COLLECTION ---")
            all_schools = self.collect_datagokr_schools()
            self.datagokr_schools = self.filter_regional_schools(all_schools)

            # Step 2: Collect from NEIS
            self.log(f"\n--- STEP 2: NEIS COLLECTION ---")
            self.neis_schools = self.collect_neis_schools()

            # Step 2.5: Collect from KERIS (School Class Information)
            self.log(f"\n--- STEP 2.5: KERIS SCHOOL INFO COLLECTION ---")
            self.keris_schools = self.collect_keris_schools()

            # Step 3: Integrate data
            self.log(f"\n--- STEP 3: DATA INTEGRATION ---")
            self.integrated_schools = self.integrate_school_data_with_keris(self.datagokr_schools, self.neis_schools, self.keris_schools)

            # Step 4: Validate quality
            self.log(f"\n--- STEP 4: QUALITY VALIDATION ---")
            quality_metrics = self.validate_data_quality(self.integrated_schools)

            # Step 5: Save results
            self.log(f"\n--- STEP 5: SAVE RESULTS ---")
            self.save_results(self.integrated_schools, quality_metrics)

            # Calculate final metrics
            self.metrics['end_time'] = datetime.now()
            self.metrics['processing_time'] = (self.metrics['end_time'] - self.metrics['start_time']).total_seconds()
            self.metrics['success_count'] = len(self.integrated_schools)
            self.metrics['integration_rate'] = quality_metrics['neis_integration_rate']

            print(f"\n{'=' * 60}")
            self.log(f"{self.region.upper()} ETL COMPLETED SUCCESSFULLY!")
            print("=" * 60)
            self.log(f"Processing time: {self.metrics['processing_time']:.1f} seconds")
            self.log(f"Total schools processed: {self.metrics['success_count']}")
            self.log(f"Integration rate: {self.metrics['integration_rate']:.1f}%")
            self.log(f"Data quality: {quality_metrics['coordinate_coverage']:.1f}% coordinates")
            self.log(f"Regional coverage: {len(quality_metrics['regional_coverage'])} divisions")

            return {
                'success': True,
                'region': self.region,
                'schools_processed': self.metrics['success_count'],
                'integration_rate': self.metrics['integration_rate'],
                'coordinate_coverage': quality_metrics['coordinate_coverage'],
                'processing_time': self.metrics['processing_time']
            }

        except Exception as e:
            self.log(f"ETL process failed: {str(e)}", "ERROR")
            return {
                'success': False,
                'region': self.region,
                'error': str(e)
            }

def main():
    """Main execution function - can be run for any region"""
    import sys

    if len(sys.argv) > 1:
        region = sys.argv[1].lower()
    else:
        region = 'seoul'  # Default region

    etl = UniversalETL(region)
    result = etl.run_etl()

    if result['success']:
        print(f"\n✅ {region.title()} ETL completed successfully!")
        print(f"📊 Processed {result['schools_processed']} schools in {result['processing_time']:.1f} seconds")
        print(f"🔗 Integration rate: {result['integration_rate']:.1f}%")
        print(f"📍 Coordinate coverage: {result['coordinate_coverage']:.1f}%")
    else:
        print(f"\n❌ {region.title()} ETL failed: {result['error']}")
        return 1

    return 0

if __name__ == "__main__":
    exit(main())