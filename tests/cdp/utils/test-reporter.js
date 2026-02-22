/**
 * Test Reporter Utility
 *
 * 테스트 결과 수집 및 출력 유틸리티
 */

class TestReporter {
  constructor() {
    this.results = [];
    this.suites = [];
    this.currentSuite = null;
  }

  /**
   * 테스트 스위트 시작
   * @param {string} name - 스위트 이름
   */
  suite(name) {
    this.currentSuite = { name, tests: [] };
    this.suites.push(this.currentSuite);
    console.log(`\n=== ${name} ===`);
  }

  /**
   * 테스트 결과 기록
   * @param {string} name - 테스트 이름
   * @param {boolean} pass - 통과 여부
   * @param {string} detail - 상세 설명
   */
  test(name, pass, detail = '') {
    const status = pass ? 'PASS' : 'FAIL';
    const emoji = pass ? '✅' : '❌';
    const result = { name, pass, detail, suite: this.currentSuite?.name };

    this.results.push(result);
    if (this.currentSuite) {
      this.currentSuite.tests.push(result);
    }

    console.log(`  ${emoji} [${status}] ${name}${detail ? ': ' + detail : ''}`);
  }

  /**
   * 비동기 테스트 실행 헬퍼
   * @param {string} name - 테스트 이름
   * @param {Function} fn - 테스트 함수 (async)
   */
  async run(name, fn) {
    try {
      const result = await fn();
      const pass = result === true || result === undefined;
      const detail = typeof result === 'string' ? result : '';
      this.test(name, pass, detail);
      return pass;
    } catch (error) {
      this.test(name, false, error.message);
      return false;
    }
  }

  /**
   * 요약 출력
   */
  summary() {
    console.log('\n============================================');
    console.log(' 테스트 결과 요약');
    console.log('============================================');

    const passed = this.results.filter((r) => r.pass).length;
    const failed = this.results.filter((r) => !r.pass).length;
    const total = this.results.length;

    console.log(`\n  전체: ${total}개 | PASS: ${passed}개 | FAIL: ${failed}개`);
    console.log(`  성공률: ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%`);

    // 스위트별 통계
    console.log('\n  스위트별 결과:');
    this.suites.forEach((suite) => {
      const suitePassed = suite.tests.filter((t) => t.pass).length;
      const suiteTotal = suite.tests.length;
      const suiteRate = suiteTotal > 0 ? ((suitePassed / suiteTotal) * 100).toFixed(0) : 0;
      console.log(`    - ${suite.name}: ${suitePassed}/${suiteTotal} (${suiteRate}%)`);
    });

    if (failed > 0) {
      console.log('\n  실패한 테스트:');
      this.results
        .filter((r) => !r.pass)
        .forEach((r) => {
          console.log(`    - [${r.suite}] ${r.name}: ${r.detail}`);
        });
    }

    console.log('\n============================================');

    return { passed, failed, total };
  }

  /**
   * 실패 여부 반환
   * @returns {boolean}
   */
  hasFailed() {
    return this.results.some((r) => !r.pass);
  }
}

module.exports = { TestReporter };
