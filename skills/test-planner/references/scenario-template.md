# Test Scenario Templates

## Controller Scenario

```markdown
#### Scenario: {endpoint}_{case}
- **Method**: `{HTTP_METHOD} /api/{resource}/{path}`
- **Description**: {한글로 테스트 목적}
- **Preconditions**:
  - Authentication: Required/Not required
  - Request body: {schema if applicable}
  - Path params: {params if applicable}
- **Mock setup**:
  - `mock_{service}.{method}.return_value = {value}`
  - or `mock_{service}.{method}.side_effect = {Exception}`
- **Test Steps**:
  1. Arrange: Mock service 설정
  2. Act: `test_client.{method}("{url}")`
  3. Assert: status code, response body, service 호출 검증
- **Expected**: HTTP {code}, `{response_structure}`
```

## Service Scenario

```markdown
#### Scenario: {method}_{case}
- **Method**: `{method_name}(args)`
- **Description**: {한글로 테스트 목적}
- **Dependencies to mock**: `mock_{repository}`
- **Mock setup**:
  - `mock_{repo}.{method}.return_value = {value}`
- **Test Steps**:
  1. Arrange: Service 인스턴스 생성, mock 설정
  2. Act: `await service.{method}(**kwargs, session=mock_session)`
  3. Assert: return value, repository 호출 검증
- **Expected**: {return value or exception}
```

## Repository Scenario

```markdown
#### Scenario: {method}_{case}
- **Method**: `{method_name}(args)`
- **Description**: {한글로 테스트 목적}
- **Database setup**: {필요한 fixture/테스트 데이터}
- **Test Steps**:
  1. Arrange: fixture로 테스트 데이터 생성
  2. Act: `await repository.{method}(**kwargs, session=async_session)`
  3. Assert: DB 상태 조회하여 검증
- **Expected**: DB State: {records}, Return: {value}
```

## Common Test Cases

| Operation | Success | Error Cases |
|-----------|---------|-------------|
| Create | 생성 성공 | 유효성 검증 실패, 중복 |
| Read | 조회 성공 | Not Found |
| Update | 수정 성공 | Not Found, 권한 없음 |
| Delete | 삭제 성공 | Not Found |
| List | 목록 조회 | 빈 목록, 필터링 |

## Naming Convention

```
test_{method}_{scenario}

Examples:
- test_create_success
- test_create_validation_error
- test_get_not_found
- test_delete_permission_denied
- test_list_empty_result
```
