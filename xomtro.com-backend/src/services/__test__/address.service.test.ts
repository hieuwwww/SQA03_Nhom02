/**
 * TEST SUITE: Quản lý địa chỉ (Address Management)
 *
 * Phạm vi test (6 hàm trong services/address.service.ts):
 *  1. insertAddress              - Thêm địa chỉ mới
 *  2. searchAddressByConditions  - Tìm kiếm địa chỉ theo điều kiện
 *  3. updateAddressById          - Cập nhật địa chỉ theo id
 *  4. updateAddressByConditions  - Cập nhật địa chỉ theo điều kiện (dùng cho setDefaultAddress)
 *  5. deleteAddressById          - Xóa 1 địa chỉ theo id
 *  6. deleteAddressByConditions  - Xóa nhiều địa chỉ theo điều kiện
 */

import { db } from '@/configs/database.config';
import { addresses, users } from '@/models/schema';
import {
  insertAddress,
  searchAddressByConditions,
  updateAddressById,
  updateAddressByConditions,
  deleteAddressById,
  deleteAddressByConditions,
} from '@/services/address.service';
import { eq, and } from 'drizzle-orm';
/**
 * Tạo user tối thiểu để làm FK cho địa chỉ.
 * Trả về userId vừa tạo.
 */
async function createTestUser(): Promise<number> {
  const result = await db
    .insert(users)
    .values({
      password: 'hashed_test_password_!1A',
      provider: 'local',
      status: 'actived',
    })
    .$returningId();
  return result[0].id;
}

/**
 * Tạo một địa chỉ mẫu gắn với userId.
 * Cho phép override bất kỳ field nào.
 * Trả về addressId vừa tạo.
 */
async function createTestAddress(
  userId: number,
  overrides: Partial<{
    provinceName: string;
    districtName: string;
    wardName: string;
    detail: string;
    isDefault: boolean;
    addressCode: string;
  }> = {}
): Promise<number> {
  const result = await insertAddress({
    userId,
    provinceName: overrides.provinceName ?? 'Hồ Chí Minh',
    districtName: overrides.districtName ?? 'Quận 1',
    wardName: overrides.wardName ?? 'Phường Bến Nghé',
    detail: overrides.detail ?? '123 Đường Test',
    isDefault: overrides.isDefault ?? false,
    addressCode: overrides.addressCode,
  });
  return result[0].id;
}

/**
 * Xóa toàn bộ dữ liệu test của userId.
 * Thứ tự: addresses trước → users sau (tránh FK constraint).
 */
async function cleanupUserById(userId: number): Promise<void> {
  await db.delete(addresses).where(eq(addresses.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

// 1. insertAddress
//    Hàm CÓ THAY ĐỔI DB — thêm địa chỉ mới
//    Dùng trong: createUserAddress controller


describe('insertAddress - thêm địa chỉ mới', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
  });

  afterEach(async () => {
    // ROLLBACK: try/finally đảm bảo luôn cleanup dù test fail
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLĐC_IADR_01
   * Mục tiêu: Insert địa chỉ mới thành công, DB lưu đúng toàn bộ field
   * Dùng trong createUserAddress: insertAddress({ userId, provinceName, ... })
  
   */
  it('TCQLĐC_IADR_01 - insert địa chỉ mới thành công, raw DB xác minh đúng toàn bộ field', async () => {
    const payload = {
      userId: testUserId,
      provinceName: 'Hà Nội',
      districtName: 'Quận Hoàn Kiếm',
      wardName: 'Phường Hàng Bạc',
      detail: '1 Phố Tràng Tiền',
      isDefault: false,
      addressCode: 'HN001',
    };

    // Thực thi hàm cần test — CÓ THAY ĐỔI DB
    const insertResult = await insertAddress(payload);
    const newAddressId = insertResult[0].id;

    // CheckDB: raw query xác minh record tồn tại với đúng giá trị
    const rawDbResult = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, newAddressId));

    expect(rawDbResult).toHaveLength(1);
    expect(rawDbResult[0].userId).toBe(testUserId);
    expect(rawDbResult[0].provinceName).toBe(payload.provinceName);
    expect(rawDbResult[0].districtName).toBe(payload.districtName);
    expect(rawDbResult[0].wardName).toBe(payload.wardName);
    expect(rawDbResult[0].detail).toBe(payload.detail);
    expect(rawDbResult[0].isDefault).toBe(false);  // default false theo schema
    expect(rawDbResult[0].addressCode).toBe(payload.addressCode);
  });

  /**
   * TCQLĐC_IADR_02
   * Mục tiêu: insertAddress trả về id hợp lệ (number > 0) để dùng trong response
   *           Controller dùng id này để query lại: searchAddressByConditions({ id: insertResult[0].id })
   * CheckDB: Xác minh id trả về tồn tại thực trong DB
   */
  it('TCQLĐC_IADR_02 - insertAddress trả về id hợp lệ, raw DB xác minh id tồn tại', async () => {
    const insertResult = await insertAddress({
      userId: testUserId,
      provinceName: 'Đà Nẵng',
      districtName: 'Quận Hải Châu',
      wardName: 'Phường Hải Châu 1',
    });

    const returnedId = insertResult[0].id;

    // CheckDB: id phải là số dương hợp lệ
    expect(typeof returnedId).toBe('number');
    expect(returnedId).toBeGreaterThan(0);

    // CheckDB: raw query xác minh id thực sự tồn tại trong DB
    const rawDbResult = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, returnedId));
    expect(rawDbResult).toHaveLength(1);
  });

  /**
   * TCQLĐC_IADR_03
   * Mục tiêu: Insert địa chỉ với isDefault=true thành công
   *           Controller logic: nếu user chưa có địa chỉ nào → isDefault=true
   * CheckDB: Raw query xác minh isDefault được lưu đúng là true
   */
  it('TCQLĐC_IADR_03 - insert địa chỉ với isDefault=true, raw DB xác minh giá trị đúng', async () => {
    const insertResult = await insertAddress({
      userId: testUserId,
      provinceName: 'Hồ Chí Minh',
      districtName: 'Quận 3',
      wardName: 'Phường 1',
      isDefault: true,
    });
    const newAddressId = insertResult[0].id;

    // CheckDB: raw query xác minh isDefault = true trong DB
    const rawDbResult = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, newAddressId));
    expect(rawDbResult[0].isDefault).toBe(true);
  });

  /**
   * TCQLĐC_IADR_04
   * Mục tiêu: Insert với userId không tồn tại trong bảng users
   *           → FK constraint violation → DB throw lỗi
   * CheckDB: Xác minh DB không tạo record khi FK bị vi phạm
   */
  it('TCQLĐC_IADR_04 - insert với userId không tồn tại → FK constraint violation', async () => {
    const nonExistentUserId = 999_999_999;

    // CheckDB trước: đếm số địa chỉ hiện có để so sánh sau
    const rawDbBefore = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, nonExistentUserId));
    expect(rawDbBefore).toHaveLength(0); // xác nhận userId này chưa có địa chỉ nào

    // Thực thi hàm — phải throw FK constraint
    await expect(
      insertAddress({
        userId: nonExistentUserId,
        provinceName: 'Hồ Chí Minh',
        districtName: 'Quận 1',
        wardName: 'Phường Bến Nghé',
      })
    ).rejects.toThrow();

    // CheckDB: xác minh không có record nào được tạo
    const rawDbAfter = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, nonExistentUserId));
    expect(rawDbAfter).toHaveLength(0);
  });

  /**
   * TCQLĐC_IADR_05
   * Mục tiêu: 1 user có thể có nhiều địa chỉ — mỗi lần insert tạo record riêng biệt
   *           Xác nhận không có unique constraint nào ngăn cản insert nhiều địa chỉ
   * CheckDB: Insert 3 địa chỉ → raw query đếm đủ 3 record trong DB
   */
  it('TCQLĐC_IADR_05 - insert nhiều địa chỉ cho cùng user, raw DB xác minh tất cả được tạo', async () => {
    await insertAddress({ userId: testUserId, provinceName: 'Hà Nội', districtName: 'Quận Ba Đình', wardName: 'Phường Trúc Bạch' });
    await insertAddress({ userId: testUserId, provinceName: 'Hà Nội', districtName: 'Quận Đống Đa', wardName: 'Phường Láng Thượng' });
    await insertAddress({ userId: testUserId, provinceName: 'Hà Nội', districtName: 'Quận Cầu Giấy', wardName: 'Phường Dịch Vọng' });

    // CheckDB: raw query đếm tổng địa chỉ của user
    const rawDbResult = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, testUserId));
    expect(rawDbResult).toHaveLength(3); // cả 3 record được tạo thành công
  });
});

// 2. searchAddressByConditions
//    Hàm SELECT thuần — không thay đổi DB
//    Dùng trong: createUserAddress, updateUserAddress, getUserAddresses,
//                getUserDefaultAddress, setDefaultAddress controller
//    → CheckDB: xác minh kết quả khớp với dữ liệu đã insert

describe('searchAddressByConditions - tìm kiếm địa chỉ theo điều kiện', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
  });

  afterEach(async () => {
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLĐC_SADC_01
   * Mục tiêu: Tìm đúng địa chỉ theo userId — dùng trong getUserAddresses controller
   * CheckDB: Insert 2 địa chỉ → search theo userId → kết quả phải trả về đúng 2 record
   */
  it('TCQLĐC_SADC_01 - tìm đúng danh sách địa chỉ theo userId', async () => {
    await createTestAddress(testUserId, { provinceName: 'Hà Nội', districtName: 'Quận 1', wardName: 'Phường A' });
    await createTestAddress(testUserId, { provinceName: 'Hồ Chí Minh', districtName: 'Quận 2', wardName: 'Phường B' });

    // Thực thi hàm cần test
    const result = await searchAddressByConditions({
      userId: { operator: 'eq', value: testUserId },
    });

    // CheckDB: xác minh đúng số lượng và đúng userId
    expect(result).toHaveLength(2);
    expect(result.every((addr) => addr.userId === testUserId)).toBe(true);
  });

  /**
   * TCQLĐC_SADC_02
   * Mục tiêu: Tìm đúng địa chỉ theo id cụ thể — dùng trong updateUserAddress, setDefaultAddress
   * CheckDB: Insert địa chỉ → search theo id → xác minh từng field khớp chính xác
   */
  it('TCQLĐC_SADC_02 - tìm đúng 1 địa chỉ theo id cụ thể, xác minh đầy đủ field', async () => {
    const addressId = await createTestAddress(testUserId, {
      provinceName: 'Đà Nẵng',
      districtName: 'Quận Hải Châu',
      wardName: 'Phường Hải Châu 1',
      detail: '99 Đường Lê Duẩn',
      isDefault: true,
    });

    // Thực thi hàm cần test
    const result = await searchAddressByConditions({
      id: { operator: 'eq', value: addressId },
    });

    // CheckDB: xác minh từng field khớp với dữ liệu đã insert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(addressId);
    expect(result[0].userId).toBe(testUserId);
    expect(result[0].provinceName).toBe('Đà Nẵng');
    expect(result[0].districtName).toBe('Quận Hải Châu');
    expect(result[0].wardName).toBe('Phường Hải Châu 1');
    expect(result[0].detail).toBe('99 Đường Lê Duẩn');
    expect(result[0].isDefault).toBe(true);
  });

  /**
   * TCQLĐC_SADC_03
   * Mục tiêu: Tìm địa chỉ mặc định theo userId + isDefault=true
   *           Dùng trong: getUserDefaultAddress, setDefaultAddress controller
   * CheckDB: Insert 2 địa chỉ (1 default, 1 không) → search isDefault=true → chỉ trả 1
   */
  it('TCQLĐC_SADC_03 - tìm đúng địa chỉ mặc định (isDefault=true) trong danh sách nhiều địa chỉ', async () => {
    await createTestAddress(testUserId, { wardName: 'Phường Thường', isDefault: false });
    const defaultAddressId = await createTestAddress(testUserId, { wardName: 'Phường Mặc Định', isDefault: true });

    // Thực thi hàm — tìm địa chỉ mặc định
    const result = await searchAddressByConditions({
      userId: { operator: 'eq', value: testUserId },
      isDefault: { operator: 'eq', value: true },
    });

    // CheckDB: chỉ trả về địa chỉ có isDefault=true
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(defaultAddressId);
    expect(result[0].isDefault).toBe(true);
    expect(result[0].wardName).toBe('Phường Mặc Định');
  });

  /**
   * TCQLĐC_SADC_04
   * Mục tiêu: userId không có địa chỉ nào → trả về []
   *           getUserAddresses: trả về mảng rỗng — bình thường, không phải lỗi
   * CheckDB: Xác minh DB không có record nào với userId này
   */
  it('TCQLĐC_SADC_04 - userId không có địa chỉ nào → trả về []', async () => {
    // Không insert địa chỉ nào cho testUserId

    const result = await searchAddressByConditions({
      userId: { operator: 'eq', value: testUserId },
    });

    // CheckDB: mảng rỗng — user chưa có địa chỉ nào
    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  /**
   * TCQLĐC_SADC_05
   * Mục tiêu: id không tồn tại → trả về []
   *           updateUserAddress: if (!selectAddressResult.length) → throw NOT_FOUND
   * CheckDB: Xác minh DB không có record với id giả
   */
  it('TCQLĐC_SADC_05 - id địa chỉ không tồn tại → trả về []', async () => {
    const nonExistentAddressId = 999_999_999;

    const result = await searchAddressByConditions({
      id: { operator: 'eq', value: nonExistentAddressId },
    });

    // CheckDB: không có record nào trong DB
    expect(result).toHaveLength(0);
  });

  /**
   * TCQLĐC_SADC_06
   * Mục tiêu: Kết hợp nhiều điều kiện AND — tìm theo userId + id cùng lúc
   *           Dùng trong updateUserAddress: { id: addressId, userId: users.id }
   *           để xác minh địa chỉ thuộc đúng user (tránh user khác sửa địa chỉ)
   * CheckDB: Insert địa chỉ của 2 user khác nhau → search theo userId + id → chỉ trả đúng 1
   */
  it('TCQLĐC_SADC_06 - tìm với nhiều điều kiện AND (userId + id), xác minh isolation giữa các user', async () => {
    // Tạo user thứ hai với địa chỉ riêng
    const secondUserId = await createTestUser();
    createdUserIds.add(secondUserId);

    const addressOfUser1 = await createTestAddress(testUserId, { wardName: 'Phường User 1' });
    await createTestAddress(secondUserId, { wardName: 'Phường User 2' });

    // Tìm với điều kiện userId=testUserId AND id=addressOfUser1
    const result = await searchAddressByConditions({
      userId: { operator: 'eq', value: testUserId },
      id: { operator: 'eq', value: addressOfUser1 },
    });

    // CheckDB: chỉ trả về đúng 1 địa chỉ của testUserId
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(addressOfUser1);
    expect(result[0].userId).toBe(testUserId);
  });

  /**
   * TCQLĐC_SADC_07
   * Mục tiêu: User có nhiều địa chỉ → searchAddressByConditions trả về tất cả (không limit)
   *           Khác với selectUserAvatarByUserId (có limit=1), hàm này không giới hạn kết quả
   * CheckDB: Insert 5 địa chỉ → search → phải trả về đủ 5
   */
  it('TCQLĐC_SADC_07 - không có limit: trả về tất cả địa chỉ của user khi có nhiều địa chỉ', async () => {
    for (let i = 1; i <= 5; i++) {
      await createTestAddress(testUserId, {
        wardName: `Phường ${i}`,
        districtName: `Quận ${i}`,
      });
    }

    const result = await searchAddressByConditions({
      userId: { operator: 'eq', value: testUserId },
    });

    // CheckDB: phải trả về đủ 5 record (không bị limit cắt bớt)
    expect(result).toHaveLength(5);
  });

  /**
   * TCQLĐC_SADC_08
   * Mục tiêu: Truyền conditions rỗng {} vào searchAddressByConditions
   *           Hàm dùng and(...whereClause) — nếu whereClause=[] thì and() không filter gì
   *           → có thể trả về TOÀN BỘ bảng addresses của mọi user → data leak nghiêm trọng
   * CheckDB: Insert địa chỉ 2 user → search {} → xác minh KHÔNG trả về data của user khác
   */
  it('TCQLĐC_SADC_08 -  conditions rỗng {} không được trả về toàn bộ bảng (data leak)', async () => {
    const secondUserId = await createTestUser();
    createdUserIds.add(secondUserId);

    await createTestAddress(testUserId, { wardName: 'Phường User 1 TC29' });
    await createTestAddress(secondUserId, { wardName: 'Phường User 2 TC29' });

    // Truyền conditions rỗng — edge case nguy hiểm
    const result = await searchAddressByConditions({} as any);

    //  nếu hàm trả về data của secondUserId → data leak
    const hasOtherUserData = result.some((addr) => addr.userId === secondUserId);
    expect(hasOtherUserData).toBe(false); // KHÔNG được lộ data user khác
  });

  /**
   * TCQLĐC_SADC_09
   * Mục tiêu: processCondition nhận field name không tồn tại trong schema
   *           → column undefined → có thể throw runtime error hoặc trả kết quả sai
   * CheckDB: Truyền field không hợp lệ → xác minh hàm xử lý an toàn
   */
  it('TCQLĐC_SADC_09 -  field không tồn tại trong schema → hàm xử lý an toàn', async () => {
    await createTestAddress(testUserId, { wardName: 'Phường Test TC30' });

    let errorThrown = false;
    let result: any[] = [];
    try {
      result = await searchAddressByConditions({
        nonExistentField: { operator: 'eq', value: 'some_value' },
      } as any);
    } catch {
      errorThrown = true;
    }

    // Nếu throw → behavior có thể chấp nhận được (fail fast)
    // Nếu không throw → result không được chứa data nhạy cảm
    if (!errorThrown) {
      const hasTestUserData = result.some((addr) => addr.userId === testUserId);
      // Nếu field không hợp lệ mà vẫn trả data → hành vi không xác định → bug
      expect(hasTestUserData).toBe(false);
    }
    // Document behavior: test luôn pass để ghi nhận kết quả thực tế
    expect(errorThrown || result.length === 0).toBe(true);
  });

  /**
   * TCQLĐC_UADC_05
   * Mục tiêu: updateAddressByConditions không có .limit() → nếu điều kiện thiếu userId
   *           có thể update địa chỉ của TẤT CẢ user → bug nghiêm trọng
   *           Test xác minh khi dùng đúng điều kiện userId thì chỉ ảnh hưởng đúng user
   * CheckDB: 2 user có địa chỉ isDefault=true → update chỉ theo userId của user 1
   *          → địa chỉ user 2 PHẢI vẫn còn isDefault=true
   */
  it('TCQLĐC_UADC_05 -  updateAddressByConditions với userId đúng không ảnh hưởng user khác', async () => {
    const secondUserId = await createTestUser();
    createdUserIds.add(secondUserId);

    await createTestAddress(testUserId, { wardName: 'Phường User 1 TC31', isDefault: true });
    await createTestAddress(secondUserId, { wardName: 'Phường User 2 TC31', isDefault: true });

    // Chỉ bỏ default địa chỉ của testUserId
    await updateAddressByConditions(
      { isDefault: false },
      { userId: { operator: 'eq', value: testUserId } }
    );

    //  địa chỉ của secondUserId PHẢI vẫn là default=true
    const rawDbUser2 = await db
      .select()
      .from(addresses)
      .where(and(eq(addresses.userId, secondUserId), eq(addresses.isDefault, true)));
    expect(rawDbUser2).toHaveLength(1); // vẫn còn isDefault=true — nếu fail → bug isolation
  });

});

// 3. updateAddressById
//    Hàm CÓ THAY ĐỔI DB — cập nhật thông tin 1 địa chỉ theo id
//    Dùng trong: updateUserAddress controller
//    → CheckDB: snapshot trước → thực thi → raw query xác minh thay đổi
//    → Rollback: afterEach CASCADE xóa addresses theo userId


describe('updateAddressById - cập nhật địa chỉ theo id', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;
  let targetAddressId: number; // id địa chỉ được tạo sẵn để test update

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
    // Tạo địa chỉ ban đầu để test update lên
    targetAddressId = await createTestAddress(testUserId, {
      provinceName: 'Hà Nội',
      districtName: 'Quận Hoàn Kiếm',
      wardName: 'Phường Cũ',
      detail: 'Số nhà cũ',
      isDefault: false,
    });
  });

  afterEach(async () => {
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLĐC_UADI_01
   * Mục tiêu: Cập nhật nhiều field của địa chỉ thành công
   *           Dùng trong updateUserAddress: updateAddressById(addressId, { provinceName, districtName, ... })
   * CheckDB: Snapshot trước → thực thi → raw query xác minh từng field mới trong DB
   */
  it('TCQLĐC_UADI_01 - cập nhật nhiều field địa chỉ, raw DB xác minh giá trị mới được lưu', async () => {
    // CheckDB: chụp snapshot TRƯỚC khi update
    const rawDbBefore = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, targetAddressId));
    expect(rawDbBefore[0].wardName).toBe('Phường Cũ'); // xác nhận trạng thái ban đầu

    const newData = {
      provinceName: 'Hồ Chí Minh',
      districtName: 'Quận Bình Thạnh',
      wardName: 'Phường Mới',
      detail: 'Số nhà mới',
      addressCode: 'HCM002',
    };

    // Thực thi hàm cần test — CÓ THAY ĐỔI DB
    await updateAddressById(targetAddressId, newData);

    // CheckDB: raw query xác minh từng field mới trong DB
    const rawDbAfter = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, targetAddressId));

    expect(rawDbAfter).toHaveLength(1);
    expect(rawDbAfter[0].provinceName).toBe(newData.provinceName);
    expect(rawDbAfter[0].districtName).toBe(newData.districtName);
    expect(rawDbAfter[0].wardName).toBe(newData.wardName);
    expect(rawDbAfter[0].detail).toBe(newData.detail);
    expect(rawDbAfter[0].addressCode).toBe(newData.addressCode);
    expect(rawDbAfter[0].userId).toBe(testUserId);   // userId không đổi
    expect(rawDbAfter[0].isDefault).toBe(false);     // isDefault không đổi
  });

  /**
   * TCQLĐC_UADI_02
   * Mục tiêu: Chỉ update wardName → các field khác GIỮ NGUYÊN trong DB
   * CheckDB: Snapshot toàn bộ record → update 1 field → raw query xác minh từng field
   */
  it('TCQLĐC_UADI_02 - partial update chỉ wardName, raw DB xác minh các field khác không đổi', async () => {
    // CheckDB: chụp snapshot toàn bộ trước khi update
    const rawDbBefore = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, targetAddressId));
    const { provinceName: provinceBefore, districtName: districtBefore, detail: detailBefore } = rawDbBefore[0];

    // Thực thi hàm — chỉ update wardName
    await updateAddressById(targetAddressId, { wardName: 'Phường Chỉ Đổi Ward' });

    // CheckDB: raw query xác minh wardName đổi, các field khác không đổi
    const rawDbAfter = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, targetAddressId));

    expect(rawDbAfter[0].wardName).toBe('Phường Chỉ Đổi Ward'); // đã thay đổi
    expect(rawDbAfter[0].provinceName).toBe(provinceBefore);    // không đổi
    expect(rawDbAfter[0].districtName).toBe(districtBefore);    // không đổi
    expect(rawDbAfter[0].detail).toBe(detailBefore);            // không đổi
  });

  /**
   * TCQLĐC_UADI_03
   * Mục tiêu: addressId không tồn tại → không throw, DB không thay đổi gì
   *           Hàm không có .limit(1) nhưng WHERE không match row nào → 0 rows affected
   * CheckDB: Raw query xác minh targetAddressId không bị ảnh hưởng
   */
  it('TCQLĐC_UADI_03 - addressId không tồn tại → không throw, DB không thay đổi', async () => {
    const nonExistentAddressId = 999_999_999;

    // CheckDB: chụp snapshot của targetAddressId
    const rawDbBefore = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, targetAddressId));
    const wardBefore = rawDbBefore[0].wardName;

    // Thực thi hàm với id không tồn tại — không được throw
    await expect(
      updateAddressById(nonExistentAddressId, { wardName: 'Ghost Ward' })
    ).resolves.not.toThrow();

    // CheckDB: targetAddressId vẫn không bị ảnh hưởng
    const rawDbAfter = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, targetAddressId));
    expect(rawDbAfter[0].wardName).toBe(wardBefore); // vẫn là giá trị cũ
  });

  /**
   * TCQLĐC_UADI_04
   * Mục tiêu: Chỉ đúng 1 địa chỉ bị update theo id, địa chỉ khác của user không bị ảnh hưởng
   * CheckDB: Insert thêm 1 địa chỉ → update targetAddressId → raw query xác minh địa chỉ kia không đổi
   */
  it('TCQLĐC_UADI_04 - update đúng 1 địa chỉ theo id, địa chỉ khác của user không bị ảnh hưởng', async () => {
    // Tạo địa chỉ thứ 2
    const secondAddressId = await createTestAddress(testUserId, {
      wardName: 'Phường Thứ Hai Không Đổi',
      districtName: 'Quận B',
    });

    // Thực thi hàm — chỉ update targetAddressId
    await updateAddressById(targetAddressId, { wardName: 'Phường Đã Cập Nhật' });

    // CheckDB: targetAddressId đã được update
    const rawDbFirst = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, targetAddressId));
    expect(rawDbFirst[0].wardName).toBe('Phường Đã Cập Nhật');

    // CheckDB: secondAddressId KHÔNG bị ảnh hưởng
    const rawDbSecond = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, secondAddressId));
    expect(rawDbSecond[0].wardName).toBe('Phường Thứ Hai Không Đổi');
  });
});


//    Hàm CÓ THAY ĐỔI DB — cập nhật nhiều địa chỉ theo điều kiện
//    Dùng trong: setDefaultAddress controller (2 lần gọi):
//      1. updateAddressByConditions({ isDefault: false }, { userId })  → bỏ default tất cả
//      2. updateAddressByConditions({ isDefault: true }, { userId, id }) → set default 1 cái
//    → CheckDB: snapshot trước → thực thi → raw query xác minh thay đổi hàng loạt


describe('updateAddressByConditions - cập nhật địa chỉ theo điều kiện', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
  });

  afterEach(async () => {
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLĐC_UADC_01
   * Mục tiêu: Set isDefault=false cho TẤT CẢ địa chỉ của user
   *           Đây là bước 1 trong setDefaultAddress controller:
   *           updateAddressByConditions({ isDefault: false }, { userId: { eq: users.id } })
   * CheckDB: Insert 3 địa chỉ (có 2 default) → update all → raw query xác minh tất cả isDefault=false
   */
  it('TCQLĐC_UADC_01 - set isDefault=false toàn bộ địa chỉ của user, raw DB xác minh tất cả đã đổi', async () => {
    // Chuẩn bị: 3 địa chỉ, 2 cái có isDefault=true
    await createTestAddress(testUserId, { wardName: 'Phường A', isDefault: true });
    await createTestAddress(testUserId, { wardName: 'Phường B', isDefault: true });
    await createTestAddress(testUserId, { wardName: 'Phường C', isDefault: false });

    // CheckDB: xác minh có 2 địa chỉ đang là default trước khi update
    const rawDbBefore = await db
      .select()
      .from(addresses)
      .where(and(eq(addresses.userId, testUserId), eq(addresses.isDefault, true)));
    expect(rawDbBefore).toHaveLength(2); // xác nhận trạng thái ban đầu

    // Thực thi hàm — bước 1 setDefaultAddress: bỏ default tất cả
    await updateAddressByConditions(
      { isDefault: false },
      { userId: { operator: 'eq', value: testUserId } }
    );

    // CheckDB: raw query xác minh không còn địa chỉ nào là default
    const rawDbAfter = await db
      .select()
      .from(addresses)
      .where(and(eq(addresses.userId, testUserId), eq(addresses.isDefault, true)));
    expect(rawDbAfter).toHaveLength(0); // tất cả đã bị set false

    // CheckDB: xác minh tổng số địa chỉ không thay đổi (chỉ cập nhật, không xóa)
    const rawDbTotal = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, testUserId));
    expect(rawDbTotal).toHaveLength(3);
  });

  /**
   * TCQLĐC_UADC_02
   * Mục tiêu: Set isDefault=true cho 1 địa chỉ cụ thể theo userId + id
   *           Đây là bước 2 trong setDefaultAddress controller:
   *           updateAddressByConditions({ isDefault: true }, { userId, id: addressId })
   * CheckDB: Sau khi bỏ default tất cả → set 1 cái → raw query xác minh đúng cái được chọn là default
   */
  it('TCQLĐC_UADC_02 - set isDefault=true cho 1 địa chỉ cụ thể, raw DB xác minh đúng địa chỉ được chọn', async () => {
    const addr1Id = await createTestAddress(testUserId, { wardName: 'Phường 1', isDefault: false });
    const addr2Id = await createTestAddress(testUserId, { wardName: 'Phường 2', isDefault: false });
    const addr3Id = await createTestAddress(testUserId, { wardName: 'Phường 3', isDefault: false });

    // Thực thi hàm — set isDefault=true chỉ cho addr2Id
    await updateAddressByConditions(
      { isDefault: true },
      {
        userId: { operator: 'eq', value: testUserId },
        id: { operator: 'eq', value: addr2Id },
      }
    );

    // CheckDB: chỉ addr2Id là default
    const rawDbAddr2 = await db.select().from(addresses).where(eq(addresses.id, addr2Id));
    expect(rawDbAddr2[0].isDefault).toBe(true);  // đúng cái được chọn

    // CheckDB: addr1Id và addr3Id không bị ảnh hưởng
    const rawDbAddr1 = await db.select().from(addresses).where(eq(addresses.id, addr1Id));
    expect(rawDbAddr1[0].isDefault).toBe(false);

    const rawDbAddr3 = await db.select().from(addresses).where(eq(addresses.id, addr3Id));
    expect(rawDbAddr3[0].isDefault).toBe(false);
  });

  /**
   * TCQLĐC_UADC_03
   * Mục tiêu: Mô phỏng toàn bộ flow setDefaultAddress controller:
   *           Bước 1: bỏ default tất cả → Bước 2: set default 1 cái mới
   *           Đảm bảo luôn chỉ có đúng 1 địa chỉ là default sau khi hoàn thành
   * CheckDB: Raw query xác minh sau cả 2 bước chỉ có đúng 1 isDefault=true
   */
  it('TCQLĐC_UADC_03 - full flow setDefaultAddress: chỉ đúng 1 địa chỉ là default sau khi hoàn thành', async () => {
    const addr1Id = await createTestAddress(testUserId, { wardName: 'Phường Cũ', isDefault: true });
    const addr2Id = await createTestAddress(testUserId, { wardName: 'Phường Mới', isDefault: false });

    // Bước 1: bỏ default tất cả
    await updateAddressByConditions(
      { isDefault: false },
      { userId: { operator: 'eq', value: testUserId } }
    );

    // Bước 2: set default cho addr2Id
    await updateAddressByConditions(
      { isDefault: true },
      {
        userId: { operator: 'eq', value: testUserId },
        id: { operator: 'eq', value: addr2Id },
      }
    );

    // CheckDB: đếm số địa chỉ có isDefault=true → phải đúng 1
    const rawDbDefault = await db
      .select()
      .from(addresses)
      .where(and(eq(addresses.userId, testUserId), eq(addresses.isDefault, true)));
    expect(rawDbDefault).toHaveLength(1);           // chỉ đúng 1 default
    expect(rawDbDefault[0].id).toBe(addr2Id);       // đúng cái được chọn
    expect(rawDbDefault[0].wardName).toBe('Phường Mới');
  });

  /**
   * TCQLĐC_UADC_04
   * Mục tiêu: Điều kiện không khớp record nào → không throw, DB không thay đổi
   * CheckDB: Raw query xác minh data của testUserId không bị ảnh hưởng
   */
  it('TCQLĐC_UADC_04 - điều kiện không khớp record nào → không throw, DB không thay đổi', async () => {
    await createTestAddress(testUserId, { wardName: 'Phường Nguyên Vẹn', isDefault: false });

    const nonExistentId = 999_999_999;

    // Thực thi hàm với id không tồn tại — không được throw
    await expect(
      updateAddressByConditions(
        { isDefault: true },
        { id: { operator: 'eq', value: nonExistentId } }
      )
    ).resolves.not.toThrow();

    // CheckDB: địa chỉ của testUserId vẫn không bị ảnh hưởng
    const rawDbAfter = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, testUserId));
    expect(rawDbAfter[0].isDefault).toBe(false); // vẫn là false
  });
});


// 5. deleteAddressById
//    Hàm CÓ THAY ĐỔI DB — xóa 1 địa chỉ theo id
//    Dùng trong: removeUserAddress controller (khi xóa 1 địa chỉ đơn lẻ)
//    → CheckDB: raw query trước xác minh tồn tại → thực thi → raw query sau xác minh đã xóa
//    → Rollback: afterEach CASCADE xóa addresses còn sót theo userId


describe('deleteAddressById - xóa 1 địa chỉ theo id', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
  });

  afterEach(async () => {
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLĐC_DADI_01
   * Loại: Positive
   * Mục tiêu: Xóa 1 địa chỉ hợp lệ thành công, record bị xóa khỏi DB
   *           Dùng trong removeUserAddress: deleteAddressById(Number(addressIds))
   * CheckDB: Raw query trước xác minh tồn tại → thực thi xóa → raw query sau xác minh đã xóa
   */
  it('TCQLĐC_DADI_01 - xóa địa chỉ hợp lệ thành công, raw DB xác minh record đã bị xóa', async () => {
    const addressId = await createTestAddress(testUserId, { wardName: 'Phường Sẽ Xóa' });

    // CheckDB trước: xác minh địa chỉ tồn tại trong DB
    const rawDbBefore = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, addressId));
    expect(rawDbBefore).toHaveLength(1); // tồn tại trước khi xóa

    // Thực thi hàm cần test — CÓ THAY ĐỔI DB
    await deleteAddressById(addressId);

    // CheckDB sau: raw query xác minh record đã bị xóa khỏi DB
    const rawDbAfter = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, addressId));
    expect(rawDbAfter).toHaveLength(0); // record đã bị xóa
  });

  /**
   * TCQLĐC_DADI_02
   * Loại: Negative
   * Mục tiêu: addressId không tồn tại → không throw, DB không thay đổi gì
   * CheckDB: Đếm tổng địa chỉ trước và sau → số lượng phải không đổi
   */
  it('TCQLĐC_DADI_02 - addressId không tồn tại → không throw, DB không thay đổi', async () => {
    await createTestAddress(testUserId, { wardName: 'Phường Nguyên Vẹn' });
    const nonExistentId = 999_999_999;

    // CheckDB: đếm số địa chỉ hiện tại
    const rawDbBefore = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, testUserId));
    const countBefore = rawDbBefore.length;

    // Thực thi hàm với id không tồn tại — không được throw
    await expect(deleteAddressById(nonExistentId)).resolves.not.toThrow();

    // CheckDB: tổng số địa chỉ không thay đổi
    const rawDbAfter = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, testUserId));
    expect(rawDbAfter).toHaveLength(countBefore);
  });

  /**
   * TCQLĐC_DADI_03
   * Loại: Edge (isolation)
   * Mục tiêu: Xóa đúng 1 địa chỉ theo id, địa chỉ khác của user KHÔNG bị xóa
   *           Xác nhận hàm dùng eq(addresses.id, addressId) chứ không xóa theo userId
   * CheckDB: Insert 2 địa chỉ → xóa 1 → raw query xác minh địa chỉ còn lại nguyên vẹn
   */
  it('TCQLĐC_DADI_03 - xóa đúng 1 địa chỉ, raw DB xác minh địa chỉ khác của user không bị ảnh hưởng', async () => {
    const addressToDelete = await createTestAddress(testUserId, { wardName: 'Phường Bị Xóa' });
    const addressToKeep = await createTestAddress(testUserId, { wardName: 'Phường Giữ Lại' });

    // CheckDB: xác minh có 2 địa chỉ trước khi xóa
    const rawDbBefore = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, testUserId));
    expect(rawDbBefore).toHaveLength(2);

    // Thực thi hàm — xóa chỉ addressToDelete
    await deleteAddressById(addressToDelete);

    // CheckDB: addressToDelete đã bị xóa
    const deletedCheck = await db.select().from(addresses).where(eq(addresses.id, addressToDelete));
    expect(deletedCheck).toHaveLength(0); // đã xóa

    // CheckDB: addressToKeep vẫn còn nguyên vẹn
    const keptCheck = await db.select().from(addresses).where(eq(addresses.id, addressToKeep));
    expect(keptCheck).toHaveLength(1);
    expect(keptCheck[0].wardName).toBe('Phường Giữ Lại');
  });

  /**
   * TCQLĐC_DADI_04
   * Loại: Edge (limit=1 boundary)
   * Mục tiêu: Hàm có .limit(1) → chỉ xóa tối đa 1 row dù id là PK (luôn unique)
   *           Test xác nhận chỉ đúng record được chỉ định bị xóa
   * CheckDB: Raw query đếm tổng trước và sau → giảm đúng 1 record
   */
  it('TCQLĐC_DADI_04 - limit(1): chỉ xóa đúng 1 record, tổng DB giảm đúng 1', async () => {
    const addr1 = await createTestAddress(testUserId, { wardName: 'Phường 1' });
    await createTestAddress(testUserId, { wardName: 'Phường 2' });
    await createTestAddress(testUserId, { wardName: 'Phường 3' });

    // CheckDB: xác nhận có 3 địa chỉ trước khi xóa
    const rawDbBefore = await db.select().from(addresses).where(eq(addresses.userId, testUserId));
    expect(rawDbBefore).toHaveLength(3);

    // Thực thi hàm — xóa addr1
    await deleteAddressById(addr1);

    // CheckDB: tổng giảm đúng 1, còn lại 2
    const rawDbAfter = await db.select().from(addresses).where(eq(addresses.userId, testUserId));
    expect(rawDbAfter).toHaveLength(2); // giảm đúng 1
    expect(rawDbAfter.every((a) => a.id !== addr1)).toBe(true); // addr1 không còn trong DS
  });
});


// 6. deleteAddressByConditions
//    Hàm CÓ THAY ĐỔI DB — xóa nhiều địa chỉ theo điều kiện
//    Dùng trong: removeUserAddress controller (khi xóa nhiều địa chỉ cùng lúc với array)
//    → CheckDB: raw query trước xác minh tồn tại → thực thi → raw query sau xác minh đã xóa
//    → Rollback: afterEach CASCADE xóa addresses còn sót theo userId


describe('deleteAddressByConditions - xóa nhiều địa chỉ theo điều kiện', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
  });

  afterEach(async () => {
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLĐC_DADC_01
   * Loại: Positive
   * Mục tiêu: Xóa nhiều địa chỉ cùng lúc theo danh sách id (operator 'in')
   *           Dùng trong removeUserAddress: deleteAddressByConditions({ id: { operator:'in', value: ids } })
   * CheckDB: Insert 3 địa chỉ → xóa 2 theo id → raw query xác minh chỉ còn 1
   */
  it('TCQLĐC_DADC_01 - xóa nhiều địa chỉ theo danh sách id, raw DB xác minh đúng số record bị xóa', async () => {
    const addr1 = await createTestAddress(testUserId, { wardName: 'Phường Xóa 1' });
    const addr2 = await createTestAddress(testUserId, { wardName: 'Phường Xóa 2' });
    const addr3 = await createTestAddress(testUserId, { wardName: 'Phường Giữ Lại' });

    // CheckDB trước: xác minh có 3 địa chỉ
    const rawDbBefore = await db.select().from(addresses).where(eq(addresses.userId, testUserId));
    expect(rawDbBefore).toHaveLength(3);

    // Thực thi hàm — xóa addr1 và addr2 bằng operator 'in'
    await deleteAddressByConditions({
      id: { operator: 'in', value: [addr1, addr2] },
      userId: { operator: 'eq', value: testUserId }, // thêm userId để an toàn
    });

    // CheckDB sau: chỉ còn addr3
    const rawDbAfter = await db.select().from(addresses).where(eq(addresses.userId, testUserId));
    expect(rawDbAfter).toHaveLength(1);                    // chỉ còn 1
    expect(rawDbAfter[0].id).toBe(addr3);                  // đúng addr3 còn lại
    expect(rawDbAfter[0].wardName).toBe('Phường Giữ Lại'); // dữ liệu nguyên vẹn
  });

  /**
   * TCQLĐC_DADC_02
   * Loại: Positive
   * Mục tiêu: Xóa tất cả địa chỉ của user theo userId (điều kiện userId)
   *           Dùng khi user xóa toàn bộ địa chỉ hoặc account bị disable
   * CheckDB: Insert 3 địa chỉ → xóa theo userId → raw query xác minh không còn địa chỉ nào
   */
  it('TCQLĐC_DADC_02 - xóa tất cả địa chỉ theo userId, raw DB xác minh không còn record nào', async () => {
    await createTestAddress(testUserId, { wardName: 'Phường 1' });
    await createTestAddress(testUserId, { wardName: 'Phường 2' });
    await createTestAddress(testUserId, { wardName: 'Phường 3' });

    // CheckDB trước: xác minh có 3 địa chỉ
    const rawDbBefore = await db.select().from(addresses).where(eq(addresses.userId, testUserId));
    expect(rawDbBefore).toHaveLength(3);

    // Thực thi hàm — xóa tất cả địa chỉ của user
    await deleteAddressByConditions({
      userId: { operator: 'eq', value: testUserId },
    });

    // CheckDB sau: không còn địa chỉ nào
    const rawDbAfter = await db.select().from(addresses).where(eq(addresses.userId, testUserId));
    expect(rawDbAfter).toHaveLength(0);
  });

  /**
   * TCQLĐC_DADC_03
   * Loại: Negative
   * Mục tiêu: Điều kiện không khớp record nào → không throw, DB không thay đổi
   * CheckDB: Đếm tổng địa chỉ trước và sau → số lượng phải không đổi
   */
  it('TCQLĐC_DADC_03 - điều kiện không khớp → không throw, DB không thay đổi', async () => {
    await createTestAddress(testUserId, { wardName: 'Phường Nguyên Vẹn 1' });
    await createTestAddress(testUserId, { wardName: 'Phường Nguyên Vẹn 2' });

    // CheckDB: đếm số địa chỉ hiện tại
    const rawDbBefore = await db.select().from(addresses).where(eq(addresses.userId, testUserId));
    const countBefore = rawDbBefore.length;

    const nonExistentIds = [999_999_997, 999_999_998, 999_999_999];

    // Thực thi hàm với id không tồn tại — không được throw
    await expect(
      deleteAddressByConditions({
        id: { operator: 'in', value: nonExistentIds },
      })
    ).resolves.not.toThrow();

    // CheckDB: tổng số địa chỉ không thay đổi
    const rawDbAfter = await db.select().from(addresses).where(eq(addresses.userId, testUserId));
    expect(rawDbAfter).toHaveLength(countBefore);
  });

  /**
   * TCQLĐC_DADC_04
   * Loại: Edge (isolation giữa các user)
   * Mục tiêu: Xóa địa chỉ theo userId chỉ ảnh hưởng đúng user đó, user khác không bị xóa
   *           Quan trọng: đảm bảo điều kiện userId trong query hoạt động đúng
   * CheckDB: 2 user mỗi người có địa chỉ → xóa địa chỉ user 1 → địa chỉ user 2 vẫn còn
   */
  it('TCQLĐC_DADC_04 - xóa địa chỉ theo userId chỉ ảnh hưởng đúng user, user khác không bị xóa', async () => {
    // Tạo user thứ 2 với địa chỉ riêng
    const secondUserId = await createTestUser();
    createdUserIds.add(secondUserId);

    await createTestAddress(testUserId, { wardName: 'Phường User 1' });
    const addr2Id = await createTestAddress(secondUserId, { wardName: 'Phường User 2' });

    // Thực thi hàm — chỉ xóa địa chỉ của testUserId
    await deleteAddressByConditions({
      userId: { operator: 'eq', value: testUserId },
    });

    // CheckDB: địa chỉ testUserId đã bị xóa
    const rawDbUser1 = await db.select().from(addresses).where(eq(addresses.userId, testUserId));
    expect(rawDbUser1).toHaveLength(0);

    // CheckDB: địa chỉ secondUserId KHÔNG bị ảnh hưởng
    const rawDbUser2 = await db.select().from(addresses).where(eq(addresses.userId, secondUserId));
    expect(rawDbUser2).toHaveLength(1);
    expect(rawDbUser2[0].id).toBe(addr2Id);
    expect(rawDbUser2[0].wardName).toBe('Phường User 2');
  });

  /**
   * TCQLĐC_DADC_05
   * Loại: Edge (BUG DETECTION - Xóa toàn bộ bảng)
   * Mục tiêu: deleteAddressByConditions không có .limit() và dùng and(...whereClause)
   *           Nếu truyền conditions rỗng {} → whereClause=[] → DELETE không có WHERE
   *           → XÓA TOÀN BỘ bảng addresses — lỗi thảm họa
   * CheckDB: Insert địa chỉ 2 user → gọi deleteAddressByConditions({})
   *          → xác minh địa chỉ KHÔNG bị xóa hết
   */
  it('TCQLĐC_DADC_05 -  conditions rỗng {} không được xóa toàn bộ bảng addresses', async () => {
    const secondUserId = await createTestUser();
    createdUserIds.add(secondUserId);

    const addr1 = await createTestAddress(testUserId, { wardName: 'Phường Phải Còn 1' });
    const addr2 = await createTestAddress(secondUserId, { wardName: 'Phường Phải Còn 2' });

    let errorThrown = false;
    try {
      await deleteAddressByConditions({} as any);
    } catch {
      errorThrown = true;
    }

    if (!errorThrown) {
      const rawAfterAddr1 = await db.select().from(addresses).where(eq(addresses.id, addr1));
      const rawAfterAddr2 = await db.select().from(addresses).where(eq(addresses.id, addr2));
      const bothDeleted = rawAfterAddr1.length === 0 && rawAfterAddr2.length === 0;
      expect(bothDeleted).toBe(false); // KHÔNG được xóa toàn bộ dữ liệu
    }
    expect(true).toBe(true);
  });

  /**
   * TCQLĐC_DADC_06
   * Loại: Edge (BUG DETECTION - Xóa nhầm địa chỉ user khác)
   * Mục tiêu: Khi xóa theo danh sách id có chứa id của user khác mà không kết hợp userId
   *           → xóa luôn địa chỉ của user khác → bug bảo mật
   *           Test xác minh phải kết hợp userId để tránh xóa nhầm
   * CheckDB: 2 user mỗi người 1 địa chỉ → xóa [addr1, addr2] kết hợp userId=user1
   *          → chỉ addr1 bị xóa, addr2 (user2) vẫn còn
   */
  it('TCQLĐC_DADC_06 -  xóa theo id kết hợp userId tránh xóa nhầm địa chỉ user khác', async () => {
    const secondUserId = await createTestUser();
    createdUserIds.add(secondUserId);

    const addr1 = await createTestAddress(testUserId, { wardName: 'Phường User 1 Sẽ Xóa' });
    const addr2 = await createTestAddress(secondUserId, { wardName: 'Phường User 2 Phải Giữ' });

    await deleteAddressByConditions({
      id: { operator: 'in', value: [addr1, addr2] },
      userId: { operator: 'eq', value: testUserId },
    });

    //  addr2 của secondUserId PHẢI vẫn còn
    const rawUser2 = await db.select().from(addresses).where(eq(addresses.id, addr2));
    expect(rawUser2).toHaveLength(1);

    const rawUser1 = await db.select().from(addresses).where(eq(addresses.id, addr1));
    expect(rawUser1).toHaveLength(0);
  });

});
