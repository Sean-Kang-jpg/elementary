// 실행: npm run test:unit
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { displaySchoolName } from './schoolName.ts'

describe('displaySchoolName', () => {
  it('drops the city prefix from public schools in the five cities', () => {
    assert.equal(displaySchoolName('서울대현초등학교', '서울특별시', '공립'), '대현초등학교')
    assert.equal(displaySchoolName('인천송월초등학교', '인천광역시 중구 제물량로 288'), '송월초등학교')
    assert.equal(displaySchoolName('대구동인초등학교', '대구광역시'), '동인초등학교')
    assert.equal(displaySchoolName('대전문화초등학교', '대전광역시'), '문화초등학교')
    assert.equal(displaySchoolName('광주화정초등학교', '광주광역시'), '화정초등학교')
  })

  it('keeps the prefix where it is part of the name', () => {
    assert.equal(displaySchoolName('광주도평초등학교', '경기도'), '광주도평초등학교')
    assert.equal(displaySchoolName('울산초등학교', '울산광역시'), '울산초등학교')
    assert.equal(displaySchoolName('부산진초등학교', '부산광역시'), '부산진초등학교')
    assert.equal(displaySchoolName('대구초등학교', '대구광역시'), '대구초등학교')
    assert.equal(displaySchoolName('광주서초등학교', '광주광역시'), '광주서초등학교')
    assert.equal(displaySchoolName('인천삼산초등학교', '인천광역시'), '인천삼산초등학교')
  })

  it('keeps national and private schools, and names whose city is unknown', () => {
    assert.equal(displaySchoolName('서울삼육초등학교', '서울특별시', '사립'), '서울삼육초등학교')
    assert.equal(displaySchoolName('서울교육대학교부설초등학교', '서울특별시'), '서울교육대학교부설초등학교')
    assert.equal(displaySchoolName('서울대현초등학교', ''), '서울대현초등학교')
  })
})
