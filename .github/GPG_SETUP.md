# GPG 서명 설정 가이드

릴리즈 파일에 GPG 서명을 추가하여 사용자가 파일 무결성과 배포자 신원을 검증할 수 있도록 합니다.

## 1. GPG 키 생성

```bash
# GPG 키 생성 (대화형)
gpg --full-generate-key

# 설정 선택:
# - 키 종류: (1) RSA and RSA
# - 키 크기: 4096 bits
# - 유효 기간: 0 (만료 없음) 또는 2년
# - 실명 입력 (예: SEPilot Desktop Release Team)
# - 이메일 입력 (예: your-email@example.com)
# - 코멘트: Release Signing Key
```

## 2. GPG 키 확인

```bash
# 생성된 키 목록 확인
gpg --list-secret-keys --keyid-format=long

# 출력 예시:
# sec   rsa4096/ABCD1234EFGH5678 2024-01-01 [SC]
#       1234567890ABCDEF1234567890ABCDEF12345678
# uid                 [ultimate] SEPilot Desktop Release Team (Release Signing Key) <your-email@example.com>
# ssb   rsa4096/IJKL9012MNOP3456 2024-01-01 [E]

# 키 ID는 'ABCD1234EFGH5678' 부분입니다
```

## 3. GPG 공개키 내보내기

```bash
# 공개키를 ASCII 형식으로 내보내기 (YOUR_KEY_ID를 실제 키 ID로 변경)
gpg --armor --export YOUR_KEY_ID > sepilot-release-key.asc

# 공개키를 키 서버에 업로드
gpg --keyserver keys.openpgp.org --send-keys YOUR_KEY_ID
```

## 4. GitHub Secrets 설정

### 4.1 개인키를 Base64로 인코딩

```bash
# 개인키를 ASCII 형식으로 내보내기 후 Base64 인코딩
gpg --armor --export-secret-keys YOUR_KEY_ID | base64 -w 0 > gpg-private-key-base64.txt

# 출력된 내용을 복사
cat gpg-private-key-base64.txt
```

**중요:** 이 파일은 절대 공개되어서는 안 됩니다!

### 4.2 GitHub Repository Secrets 추가

1. GitHub 저장소 → Settings → Secrets and variables → Actions
2. "New repository secret" 클릭
3. Secret 추가:
   - **Name:** `GPG_PRIVATE_KEY`
   - **Value:** 위에서 복사한 Base64 인코딩된 개인키 전체 내용

### 4.3 공개키 README에 추가

`README.md`에 다음 내용 추가:

```markdown
## 🔒 릴리즈 검증

### GPG 서명 검증

모든 릴리즈 파일은 GPG로 서명되어 있습니다.

**공개키 가져오기:**
\`\`\`bash
gpg --keyserver keys.openpgp.org --recv-keys YOUR_KEY_ID
\`\`\`

또는 공개키 파일 직접 다운로드:
\`\`\`bash
curl -O https://raw.githubusercontent.com/YOUR_ORG/sepilot_desktop/main/.github/sepilot-release-key.asc
gpg --import sepilot-release-key.asc
\`\`\`

**서명 검증:**
\`\`\`bash
# .exe 파일 검증
gpg --verify SEPilot-Setup-0.6.0.exe.asc SEPilot-Setup-0.6.0.exe

# 체크섬 파일 검증
gpg --verify SHA256SUMS.txt.asc SHA256SUMS.txt
sha256sum -c SHA256SUMS.txt
\`\`\`
```

## 5. 공개키 파일 커밋

```bash
# 공개키를 저장소에 추가
mv sepilot-release-key.asc .github/

# 커밋
git add .github/sepilot-release-key.asc
git commit -m "docs: GPG 릴리즈 서명 공개키 추가"
git push
```

## 6. 테스트

### 6.1 로컬에서 서명 테스트

```bash
# 테스트 파일 생성
echo "test" > test.txt

# 서명
gpg --detach-sign --armor test.txt

# 검증
gpg --verify test.txt.asc test.txt
```

### 6.2 GitHub Actions 테스트

1. 새 태그 생성:
   ```bash
   git tag v0.6.1-test
   git push origin v0.6.1-test
   ```

2. GitHub Actions → "Build and Release" 워크플로우 확인

3. Release 페이지에서 `.asc` 파일 다운로드 및 검증

## 7. 키 관리 베스트 프랙티스

### 7.1 백업

```bash
# 전체 키링 백업 (안전한 장소에 보관)
gpg --export-secret-keys --armor YOUR_KEY_ID > gpg-private-backup.asc
gpg --export --armor YOUR_KEY_ID > gpg-public-backup.asc

# 또는 전체 GPG 디렉토리 백업
tar -czf gpg-backup.tar.gz ~/.gnupg/
```

### 7.2 키 폐기 계획

키가 유출되었거나 더 이상 사용하지 않을 경우:

```bash
# 폐기 인증서 생성 (키 생성 시 미리 만들어두는 것 권장)
gpg --output revoke-cert.asc --gen-revoke YOUR_KEY_ID

# 키 폐기
gpg --import revoke-cert.asc
gpg --keyserver keys.openpgp.org --send-keys YOUR_KEY_ID
```

### 7.3 보안 주의사항

- ❌ **절대로** 개인키(`GPG_PRIVATE_KEY`)를 공개하지 마세요
- ✅ GitHub Secrets는 암호화되어 안전하게 저장됩니다
- ✅ 개인키 백업은 암호화된 저장소에 보관
- ✅ 정기적으로 키를 로테이션 (2-3년마다)

## 8. 문제 해결

### GPG 명령어가 없음

**Ubuntu/Debian:**
```bash
sudo apt-get install gnupg
```

**macOS:**
```bash
brew install gnupg
```

**Windows:**
[Gpg4win](https://www.gpg4win.org/) 다운로드 및 설치

### 키 서버 연결 실패

다른 키 서버 시도:
```bash
gpg --keyserver keyserver.ubuntu.com --send-keys YOUR_KEY_ID
gpg --keyserver pgp.mit.edu --send-keys YOUR_KEY_ID
```

### GitHub Actions에서 GPG 서명 실패

1. `GPG_PRIVATE_KEY` Secret이 올바르게 설정되었는지 확인
2. Base64 인코딩이 제대로 되었는지 확인
3. 키에 암호가 설정되어 있다면 `--batch --yes --pinentry-mode loopback` 옵션 추가 필요

## 참고 자료

- [GPG 공식 문서](https://gnupg.org/documentation/)
- [GitHub GPG 서명 가이드](https://docs.github.com/en/authentication/managing-commit-signature-verification)
- [OpenPGP Best Practices](https://riseup.net/en/security/message-security/openpgp/best-practices)
