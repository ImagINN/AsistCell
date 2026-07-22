import { HttpException, HttpStatus } from '@nestjs/common';

export class StateMachineException extends HttpException {
  constructor(currentStatus: string, targetStatus: string) {
    super(
      `Invalid state transition from ${currentStatus} to ${targetStatus}`,
      HttpStatus.UNPROCESSABLE_ENTITY, // 422
    );
  }
}
