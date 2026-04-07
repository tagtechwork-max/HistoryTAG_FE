# Cài Đặt jwt-decode (Optional nhưng Khuyên Dùng)

## Tại Sao Cần jwt-decode?

1. **UTF-8 Support**: `atob()` không hỗ trợ UTF-8 tốt → có thể crash với ký tự tiếng Việt
2. **Standard Library**: Được maintain bởi cộng đồng, test kỹ
3. **Type Safety**: Có TypeScript definitions

## Cài Đặt

```bash
npm install jwt-decode
# hoặc
yarn add jwt-decode
```

## Code Đã Hỗ Trợ

Code trong `contexts/AuthContext.tsx` đã có fallback:
- ✅ Nếu có `jwt-decode` → dùng library
- ✅ Nếu không có → dùng manual decode với UTF-8 support

## Không Bắt Buộc

Nếu không cài `jwt-decode`, code vẫn hoạt động với manual decode (đã fix UTF-8 issue).

Nhưng **khuyên dùng** để đảm bảo an toàn và performance tốt hơn.
