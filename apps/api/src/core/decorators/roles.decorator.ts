import { SetMetadata } from '@nestjs/common';

export enum Role {
  Member = 'member',
  Staff = 'staff',
  ComplianceOfficer = 'compliance_officer',
  BoardDirector = 'board_director',
  Admin = 'admin',
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
