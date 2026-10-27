import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

// Lỗi do không kết nối được CSDL chủ (đang failover, hoặc pg-router chặn ghi vì máy này mất quorum)
const DB_DOWN = /ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ETIMEDOUT|Connection terminated|timeout exceeded when trying to connect|terminating connection|read-only transaction/i;

// Đổi thành gRPC UNAVAILABLE -> gateway trả HTTP 503 -> Frontend LB chuyển yêu cầu sang máy còn lại
export function asUnavailable(err: any): any {
  if (err instanceof RpcException) return err;
  if (DB_DOWN.test(String(err?.message || '')) || DB_DOWN.test(String(err?.code || ''))) {
    return new RpcException({ code: status.UNAVAILABLE, message: 'Primary database unavailable (failover in progress or no quorum)' });
  }
  return err;
}
