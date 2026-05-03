import { db } from '@/configs/database.config';
import { posts, rentalPosts } from '@/models/schema';
import { searchPosts } from '../post.controller';
import { StatusCodes } from 'http-status-codes';
import { eq, inArray } from 'drizzle-orm/sql/expressions/conditions';

describe('Unit Test: searchPosts - RENTAL ONLY', () => {
  let mockRes: any;
  let next: any;
  // Mảng lưu trữ các ID đã tạo trong mỗi test case
  let createdPostIds: number[] = [];

  beforeEach(() => {
    createdPostIds = []; // Reset mảng trước mỗi test case
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      // Đảm bảo send cũng return về chính nó hoặc mock đúng flow của ApiResponse
      send: jest.fn().mockImplementation((data) => {
        return data;
      })
    };
    next = jest.fn();
  });

  afterEach(async () => {
    if (createdPostIds.length > 0) {
      // Xóa ở bảng con trước (rentalPosts) để tránh lỗi Foreign Key
      await db.delete(rentalPosts).where(inArray(rentalPosts.postId, createdPostIds));
      // Sau đó xóa ở bảng cha (posts)
      await db.delete(posts).where(inArray(posts.id, createdPostIds));
    }
  });

  // Hàm bổ trợ Seed dữ liệu Rental nhanh
  const seedRental = async (data: {
    id: number;
    title: string;
    priceStart: number;
    priceEnd: number;
    totalArea: number;
    province?: string;
    district?: string;
    ward?: string;
    furniture?: boolean;
    pet?: boolean;
    longitude?: number;
    latitude?: number;
    status?: string;
  }) => {
    await db.insert(posts).values({
      id: data.id,
      title: data.title,
      titleSlug: data.title.toLowerCase().replace(/ /g, '-'),
      type: 'rental',
      status: data.status || 'actived',
      addressProvince: data.province || 'Hà Nội',
      addressDistrict: data.district || 'Hai Bà Trưng',
      addressWard: data.ward || 'Phố Huế',
      addressLongitude: data.longitude || 106.660172,
      addressLatitude: data.latitude || 10.762622,
      ownerId: 21
    });
    await db.insert(rentalPosts).values({
      postId: data.id,
      priceStart: data.priceStart,
      priceEnd: data.priceEnd,
      totalArea: data.totalArea,
      minLeaseTerm: 6,
      minLeaseTermUnit: 'month',
      hasFurniture: data.furniture || false,
      allowPets: data.pet || false
    });

    // Đẩy ID vừa tạo vào danh sách quản lý để xóa sau khi test xong
    createdPostIds.push(data.id);
  };

  // --- CÁC TEST CASE PHỦ NHÁNH ĐIỀU KIỆN ---

  test('TC_UNIT_LBV_SEARCHCON_1: Lọc theo tiện ích', async () => {
    await seedRental({
      id: 999998,
      title: 'Phòng đầy đủ đồ',
      priceStart: 3000000,
      priceEnd: 5000000,
      totalArea: 30,
      furniture: true,
      pet: true
    });
    await seedRental({
      id: 999999,
      title: 'Phòng trống',
      priceStart: 2000000,
      priceEnd: 4000000,
      totalArea: 25,
      furniture: false,
      pet: false
    });

    // Update thêm các cột tiện nghi khác nếu hàm seed chưa có
    await db
      .update(rentalPosts)
      .set({
        hasAirConditioner: true,
        hasWashingMachine: true,
        hasRefrigerator: true,
        hasPrivateBathroom: true,
        hasParking: true,
        hasSecurity: true,
        hasElevator: true,
        hasInternet: true
      })
      .where(eq(rentalPosts.postId, 999998));

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          hasFurniture: true,
          hasAirConditioner: true,
          hasWashingMachine: true,
          hasRefrigerator: true,
          hasPrivateBathroom: true,
          hasParking: true,
          hasSecurity: true,
          hasElevator: true,
          hasInternet: true,
          allowPets: true
        },
        orderConditions: {
          updatedAt: 'desc'
        }
      }
    } as any;

    await searchPosts(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0].data;

    const lastResult = response.results[response.results.length - 1];

    expect(response.results.length).toBeGreaterThanOrEqual(1);

    let found = 0;
    for (const result of response.results) {
      const actualId = result.post ? result.post.id : result.id;
      if (actualId === 999998) {
        found = 1;
        break;
      }
    }
    expect(found).toBe(1); // Phải tìm thấy bài viết có đầy đủ đồ và cho phép nuôi thú cưng

    const updatedAt1 = new Date(
      response.results[0].post ? response.results[0].post.updatedAt : response.results[0].updatedAt
    );
    const updatedAtN = new Date(lastResult.post ? lastResult.post.updatedAt : lastResult.updatedAt);
    expect(updatedAt1.getTime()).toBeGreaterThanOrEqual(updatedAtN.getTime()); // Kiểm tra thứ tự giảm dần
  }, 10000);

  test('TC_UNIT_LBV_SEARCHCON_2: Phủ nhánh lọc theo tỉnh thành (Province) dùng toán tử LIKE', async () => {
    await seedRental({
      id: 999998,
      title: 'Phòng ở Đà Nẵng',
      priceStart: 4000000,
      priceEnd: 6000000,
      totalArea: 40,
      province: 'Đà Nẵng'
    });
    await seedRental({
      id: 999999,
      title: 'Phòng ở Thủ Đô',
      priceStart: 3500000,
      priceEnd: 5500000,
      totalArea: 35,
      province: 'Hà Nội'
    });

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: { provinceName: 'Đà Nẵng' }, // Test phần tên (LIKE %%)
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0].data;
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(response.results.length).toBeGreaterThanOrEqual(1);
    const lastResult = response.results[response.results.length - 1];

    const actualId = lastResult.post ? lastResult.post.id : lastResult.id;

    expect(actualId).toBe(999998);
  }, 10000);

  test('TC_UNIT_LBV_SEARCHCON_3: Phủ nhánh Price Range (priceStart <= price <= priceEnd)', async () => {
    await seedRental({ id: 999998, title: 'Phòng 3tr', priceStart: 3000000, priceEnd: 5000000, totalArea: 20 });
    await seedRental({ id: 999999, title: 'Phòng 7tr', priceStart: 7000000, priceEnd: 9000000, totalArea: 30 });

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: { priceStart: 2000000, priceEnd: 5000000 },
        orderConditions: { price: 'asc' }
      }
    } as any;

    await searchPosts(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0].data;
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(response.results.length).toBeGreaterThanOrEqual(1);

    let ok = 0;
    const price1 = response.results[0].detail ? response.results[0].detail.priceStart : response.results[0].priceStart;
    const priceN = response.results[response.results.length - 1].detail
      ? response.results[response.results.length - 1].detail.priceStart
      : response.results[response.results.length - 1].priceStart;
    expect(Number(price1)).toBeLessThanOrEqual(Number(priceN)); // Kiểm tra thứ tự tăng dần
    for (const result of response.results) {
      const actualId = result.post ? result.post.id : result.id;
      if (actualId === 999998) {
        ok = 1;
        break;
      }
    }
    expect(ok).toBe(1); // Phải tìm thấy bài viết có giá trong khoảng 3tr-5tr
  }, 10000);

  test('TC_UNIT_LBV_SEARCHCON_4: Phủ nhánh Phân trang (Pagination) trên DB thật', async () => {
    // Seed 5 bài viết
    for (let i = 999990; i < 999995; i++) {
      await seedRental({ id: i, title: `Phòng mẫu ${i}`, priceStart: 1000000, priceEnd: 2000000, totalArea: 20 });
    }

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {},
        orderConditions: {},
        pagination: { page: 1, pageSize: 3 }
      }
    } as any;

    await searchPosts(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0].data;
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(response.results.length).toBe(3); // Chỉ lấy 3 bản ghi do pageSize=3
    expect(response.pagination.totalCount).toBeGreaterThanOrEqual(5); // Tổng số bản ghi >= 5
  });

  test('TC_UNIT_LBV_SEARCHCON_5: Thiếu cả whereConditions và orderConditions', async () => {
    const req = {
      params: { type: 'rental' },
      body: {} // Body rỗng
    } as any;

    await searchPosts(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        message: 'whereConditions or orderConditions is required, but it can be empty'
      })
    );
  });

  test('TC_UNIT_LBV_SEARCHCON_6: Chỉ có whereConditions, thiếu orderConditions', async () => {
    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: { title: 'Phòng trọ' }
        // Thiếu orderConditions
      }
    } as any;

    await searchPosts(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        message: 'whereConditions or orderConditions is required, but it can be empty'
      })
    );
  });

  test('TC_UNIT_LBV_SEARCHCON_7: Chỉ có orderConditions, thiếu whereConditions', async () => {
    const req = {
      params: { type: 'rental' },
      body: {
        orderConditions: { createdAt: 'desc' }
        // Thiếu whereConditions
      }
    } as any;

    await searchPosts(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        message: 'whereConditions or orderConditions is required, but it can be empty'
      })
    );
  });

  test('TC_UNIT_LBV_SEARCHCON_8: Trả về lỗi 400 nếu post type không hợp lệ', async () => {
    const req = {
      params: { type: 'wrong-type-123' }, // Type không tồn tại trong postType enum
      body: {
        whereConditions: {},
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400, // StatusCodes.BAD_REQUEST
        message: 'Invalid post type parameter'
      })
    );
  });

  test('TC_UNIT_LBV_SEARCHCON_9: Trả về lỗi 400 nếu post type rỗng', async () => {
    const req = {
      params: { type: '' }, // Type không tồn tại trong postType enum
      body: {
        whereConditions: {},
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400, // StatusCodes.BAD_REQUEST
        message: 'Invalid post type parameter'
      })
    );
  });

  test('TC_UNIT_LBV_SEARCHCON_10: Trả về lỗi 400 nếu post status không hợp lệ', async () => {
    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          status: 'invalid-status-xyz' // Status không nằm trong postStatus enum
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Invalid post status parameter'
      })
    );
  });

  test('TC_UNIT_LBV_SEARCHCON_11: Lỗi khi có nearest nhưng thiếu longitude', async () => {
    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          nearest: { latitude: 10.762622, radius: 5 } // Thiếu longitude
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422, // StatusCodes.UNPROCESSABLE_ENTITY
        message: 'Longitude and latitude are required when [nearest] param is provided'
      })
    );
  });

  test('TC_UNIT_LBV_SEARCHCON_12: Lỗi khi có nearest nhưng thiếu latitude', async () => {
    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          nearest: { longitude: 106.660172 } // Thiếu latitude
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        message: 'Longitude and latitude are required when [nearest] param is provided'
      })
    );
  });

  test('TC_UNIT_LBV_SEARCHCON_13: Lỗi khi nearest là object rỗng {}', async () => {
    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          nearest: {} // Không có cả long và lat
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        message: 'Longitude and latitude are required when [nearest] param is provided'
      })
    );
  });

  test('TC_UNIT_LBV_SEARCHCON_14: Trả về lỗi 422 nếu dateStart sai định dạng', async () => {
    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          dateStart: 'chuỗi-không-phải-ngày-tháng'
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        message: 'dateStart value is invalid'
      })
    );
  });

  test('TC_UNIT_LBV_SEARCHCON_15: Tự động hoán đổi khi totalAreaStart > totalAreaEnd', async () => {
    // 1. Seed một bài viết có diện tích 75m2
    const testId = 777001;
    await seedRental({
      id: testId,
      title: 'Phòng diện tích 75m2',
      priceStart: 3000000,
      priceEnd: 5000000,
      totalArea: 75 // Nằm trong khoảng [50, 100]
    });

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          totalAreaStart: 100, // Lớn hơn End
          totalAreaEnd: 50
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    // 2. Lấy dữ liệu từ mockRes
    const response = mockRes.json.mock.calls[0][0].data;
    expect(mockRes.status).toHaveBeenCalledWith(200);

    // 3. Kiểm tra: Nếu hoán đổi thành công thành [50, 100], bài viết 75m2 phải xuất hiện
    const target = response.results.find((r: any) => r.post?.id === testId || r.id === testId);

    expect(target).toBeDefined();
    // Verify lại giá trị diện tích từ DB trả về để chắc chắn
    const actualArea = target.detail ? target.detail.totalArea : target.totalArea;
    expect(Number(actualArea)).toBe(75);
  });

  test('TC_UNIT_LBV_SEARCHCON_16: Tìm kiếm theo vị trí (nearest) trả về đúng dữ liệu', async () => {
    const testId = 666001;
    // Seed 1 bài ở Bách Khoa Hà Nội (21.006, 105.842)
    await seedRental({
      id: testId,
      title: 'Phòng gần Đại học Bách Khoa',
      priceStart: 3000,
      priceEnd: 5000,
      totalArea: 20,
      longitude: 105.842,
      latitude: 21.006
      // Giả sử hàm seedRental của bạn lưu được tọa độ, nếu không hãy bổ sung vào db.insert
    });

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          nearest: { longitude: 105.842, latitude: 21.006 }
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0].data;
    expect(mockRes.status).toHaveBeenCalledWith(200);
    const target = response.results.find((r: any) => r.post?.id === testId || r.id === testId);

    expect(target).toBeDefined();
    expect(target.post?.title || target.title).toBe('Phòng gần Đại học Bách Khoa');
  });

  test('TC_UNIT_LBV_SEARCHCON_17: Lọc theo dateStart trả về các bài đăng sau ngày chỉ định', async () => {
    const testId = 666002;
    await seedRental({
      id: testId,
      title: 'Bài đăng mới tháng 5/2026',
      priceStart: 3000,
      priceEnd: 5000,
      totalArea: 25
    });

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          dateStart: '2026-04-01' // Lọc các bài từ tháng 4 trở đi
        },
        orderConditions: {
          createdAt: 'asc' // Sắp xếp theo ngày tạo tăng dần để dễ kiểm tra
        }
      }
    } as any;

    await searchPosts(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0].data;
    expect(mockRes.status).toHaveBeenCalledWith(200);
    const target = response.results.find((r: any) => r.post?.id === testId || r.id === testId);

    expect(target).toBeDefined();
    const create1 = new Date(target.post?.createdAt || target.createdAt);
    const crete2 = new Date(
      response.results[response.results.length - 1].post
        ? response.results[response.results.length - 1].post.createdAt
        : response.results[response.results.length - 1].createdAt
    );
    expect(create1.getTime()).toBeLessThanOrEqual(crete2.getTime()); // Kiểm tra thứ tự tăng dần
  });

  test('TC_UNIT_LBV_SEARCHCON_18: Lọc theo status actived trả về đúng kết quả', async () => {
    const activeId = 666003;
    const pendingId = 666004;

    // Seed bài Active
    await seedRental({ id: activeId, title: 'Bài đã duyệt', priceStart: 2000, priceEnd: 4000, totalArea: 20 });

    // Seed bài Pending
    await seedRental({
      id: pendingId,
      status: 'unactived',
      title: 'Bài chưa duyệt',
      priceStart: 2000,
      priceEnd: 4000,
      totalArea: 20
    });

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: { status: 'actived' },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0].data;
    expect(mockRes.status).toHaveBeenCalledWith(200);
    const results = response.results;

    // Kiểm tra: bài active phải có, bài pending phải không có
    const hasActive = results.some((r: any) => r.post?.id === activeId || r.id === activeId);
    const hasPending = results.some((r: any) => r.post?.id === pendingId || r.id === pendingId);

    expect(hasActive).toBe(true);
    expect(hasPending).toBe(false);
  });

  test('TC_UNIT_LBV_SEARCHCON_19: Lọc bài đăng theo ID người chủ (ownerId)', async () => {
    const targetOwnerId = 21; // ID chủ sở hữu giả định
    const testId = 555001;

    // 1. Seed bài viết với ownerId cụ thể
    // Lưu ý: Cập nhật trực tiếp vào DB sau khi seed nếu hàm seedRental mặc định dùng ownerId cố định
    await seedRental({
      id: testId,
      title: 'Bài đăng của chủ nhà ID 21',
      priceStart: 2000,
      priceEnd: 4000,
      totalArea: 30
    });

    // Cập nhật ownerId cho bài đăng vừa tạo để khớp với điều kiện tìm kiếm
    await db.update(posts).set({ ownerId: targetOwnerId }).where(eq(posts.id, testId));

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          ownerId: targetOwnerId // Truyền ownerId vào đây
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    // 2. Kiểm tra kết quả trả về
    const response = mockRes.json.mock.calls[0][0].data;
    expect(mockRes.status).toHaveBeenCalledWith(200);
    // Tìm xem có bài đăng của ownerId 21 trong danh sách kết quả không
    const isOwnerPostFound = response.results.some((r: any) => {
      const postOwnerId = r.post ? r.post.ownerId : r.ownerId;
      return (r.post?.id === testId || r.id === testId) && postOwnerId === targetOwnerId;
    });

    expect(isOwnerPostFound).toBe(true);
    expect(mockRes.json).toHaveBeenCalled();
  });

  test('TC_UNIT_LBV_SEARCHCON_20: Lọc theo tiêu đề (titleSlug) bằng toán tử LIKE', async () => {
    const testId = 444001;
    const title = 'Cho thuê phòng trọ giá rẻ';
    // Slug dự kiến: 'cho-thue-phong-tro-gia-re'

    await seedRental({
      id: testId,
      title: title,
      priceStart: 2000,
      priceEnd: 3000,
      totalArea: 20
    });

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          title: 'phòng trọ' // Tìm kiếm một phần của tiêu đề
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0].data;
    const found = response.results.some((r: any) => r.post?.id === testId || r.id === testId);

    expect(found).toBe(true);
    expect(mockRes.status).toHaveBeenCalledWith(200);
  });

  test('TC_UNIT_LBV_SEARCHCON_21: Lọc theo đơn vị diện tích (totalAreaUnit)', async () => {
    const testId = 444002;
    await seedRental({
      id: testId,
      title: 'Phòng mẫu m2',
      priceStart: 2000,
      priceEnd: 3000,
      totalArea: 25
    });

    // Mặc định seedRental có thể đã set m2, ta có thể cập nhật lại để chắc chắn
    await db.update(rentalPosts).set({ totalAreaUnit: 'm2' }).where(eq(rentalPosts.postId, testId));

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          totalAreaStart: 20,
          totalAreaUnit: 'm2'
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    const response = mockRes.json.mock.calls[0][0].data;
    expect(response.results.length).toBeGreaterThanOrEqual(1);
    const found = response.results.some((r: any) => r.post?.id === testId || r.id === testId);
    expect(found).toBe(true);
  });

  test('TC_UNIT_LBV_SEARCHCON_22: priceStart là số âm', async () => {
    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: { priceStart: -1000000 },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    // Tùy vào logic của bạn:
    // 1. Nếu bạn throw lỗi 422:
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));
    // 2. Nếu bạn vẫn cho chạy nhưng trả về 0 kết quả hoặc status 200:
    //expect(mockRes.status).toHaveBeenCalledWith(200);
  });

  test('TC_UNIT_LBV_SEARCHCON_23: priceStart là chuỗi ký tự (NaN)', async () => {
    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: { priceStart: 'giá-rẻ-quá' },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    // Nếu code bạn không check isNaN, nó sẽ truyền NaN vào SQL gây lỗi 500
    // Một bộ code tốt nên trả về lỗi 422 hoặc xử lý an toàn
    const error = next.mock.calls[0][0];
    if (error) {
      expect(error.statusCode).toBe(422);
    }
  });

  test('TC_UNIT_LBV_SEARCHCON_24: Tự động hoán đổi khi priceStart > priceEnd', async () => {
    const testId = 333001;
    // Seed 1 bài có giá 5 triệu (nằm trong khoảng 4tr - 6tr)
    await seedRental({
      id: testId,
      title: 'Phòng 5 triệu',
      priceStart: 5000000,
      priceEnd: 5000000,
      totalArea: 20
    });

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          priceStart: 6000000, // Start > End
          priceEnd: 4000000
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0].data;
    const found = response.results.some((r: any) => r.post?.id === testId || r.id === testId);

    // Nếu logic hoán đổi giá chưa có trong code, test này sẽ FAIL (Expected: true, Received: false)
    // Đây là lúc bạn dùng kết quả test để báo cáo: "Hệ thống chưa xử lý hoán đổi giá"
    expect(found).toBe(true);
  });

  test('TC_UNIT_LBV_SEARCHCON_25: Lọc chính xác với dữ liệu số thập phân (Decimal)', async () => {
    const testId = 333005;

    // 1. Seed dữ liệu với giá trị thập phân lẻ
    // Giả sử giá thuê là 3.550.000 (đơn vị triệu: 3.55)
    await seedRental({
      id: testId,
      title: 'Phòng giá lẻ thập phân',
      priceStart: 3.55,
      priceEnd: 3.55,
      totalArea: 25.5 // Diện tích cũng để thập phân
    });

    // 2. Trường hợp A: Tìm kiếm với khoảng bao phủ số thập phân đó
    const reqMatch = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          priceStart: 3.5,
          priceEnd: 3.6
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(reqMatch, mockRes, next);
    let response = mockRes.json.mock.calls[0][0].data;
    let found = response.results.some((r: any) => r.post?.id === testId || r.id === testId);

    expect(found).toBe(true); // Phải tìm thấy bài viết 3.55

    // Clear mock để test lần tiếp theo
    mockRes.json.mockClear();

    // 3. Trường hợp B: Tìm kiếm với giá trị biên sát nút
    const reqMiss = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          priceStart: 3.56, // Lớn hơn 3.55 một chút
          priceEnd: 4.0
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(reqMiss, mockRes, next);
    response = mockRes.json.mock.calls[0][0].data;
    found = response.results.some((r: any) => r.post?.id === testId || r.id === testId);

    expect(found).toBe(false); // Không được tìm thấy vì 3.55 nằm ngoài khoảng [3.56, 4.0]
  });

  test('TC_UNIT_LBV_SEARCHCON_26: totalAreaStart là số âm', async () => {
    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: { totalAreaStart: -15 },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    // Mong đợi: Hệ thống trả về lỗi 422 (Unprocessable Entity)
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        message: expect.stringContaining('invalid') // Hoặc message cụ thể của bạn
      })
    );
  });

  test('TC_UNIT_LBV_SEARCHCON_27: totalAreaStart là chuỗi ký tự (NaN)', async () => {
    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: { totalAreaStart: 'rất-rộng' },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    // Kiểm tra xem hệ thống có chặn lỗi NaN trước khi gửi xuống DB không
    const error = next.mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(422);
  });

  test('TC_UNIT_LBV_SEARCHCON_28: Lọc diện tích với số thập phân lẻ', async () => {
    const testId = 333101;

    // 1. Seed bài viết có diện tích 25.75 m2
    await seedRental({
      id: testId,
      title: 'Phòng diện tích lẻ 25.75',
      priceStart: 3000000,
      priceEnd: 5000000,
      totalArea: 25.75
    });

    // 2. Tìm kiếm trong khoảng [25.5, 26.0]
    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          totalAreaStart: 25.5,
          totalAreaEnd: 26.0
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0].data;
    const found = response.results.some((r: any) => r.post?.id === testId || r.id === testId);

    expect(found).toBe(true);
  });

  test('TC_UNIT_LBV_SEARCHCON_29: Lỗi khi tọa độ vượt quá phạm vi địa lý thực tế', async () => {
    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          nearest: {
            longitude: 200, // Sai (max 180)
            latitude: 100, // Sai (max 90)
            radius: 5
          }
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    // Mong đợi hệ thống chặn lại với lỗi 422
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422
      })
    );
  });

  test('TC_UNIT_LBV_SEARCHCON_30: Trả về bài đăng nằm TRONG bán kính tìm kiếm', async () => {
    const testId = 888001;
    // 1. Seed 1 bài ở Hồ Gươm
    await seedRental({
      id: testId,
      title: 'Phòng ở Hồ Gươm',
      priceStart: 1000,
      priceEnd: 2000,
      totalArea: 20
    });
    await db
      .update(posts)
      .set({
        addressLongitude: 105.8527,
        addressLatitude: 21.0285
      })
      .where(eq(posts.id, testId));

    // 2. Search từ Nhà hát lớn với bán kính 3km
    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          nearest: { longitude: 105.8588, latitude: 21.0245, radius: 3 }
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0].data;
    const found = response.results.some((r: any) => r.post?.id === testId || r.id === testId);

    expect(found).toBe(true); // Cách 800m nên phải tìm thấy trong 1km
  });

  test('TC_UNIT_LBV_SEARCHCON_31: KHÔNG trả về bài đăng nằm NGOÀI bán kính tìm kiếm', async () => {
    const testId = 888002;
    await seedRental({
      id: testId,
      title: 'Phòng ở xa',
      priceStart: 1000,
      priceEnd: 2000,
      totalArea: 20
    });
    await db
      .update(posts)
      .set({
        addressLongitude: 105.8527,
        addressLatitude: 21.0285
      })
      .where(eq(posts.id, testId));

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          nearest: { longitude: 105.8588, latitude: 21.0245, radius: 0.5 } // Chỉ tìm trong 500m
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0].data;
    const found = response.results.some((r: any) => r.post?.id === testId || r.id === testId);

    expect(found).toBe(false); // Cách 800m nên không được xuất hiện trong 500m
  });

  test('TC_UNIT_LBV_SEARCHCON_32: Tên Quận không thuộc về Tỉnh đã chọn', async () => {
    const testId = 777101;
    // Seed 1 bài ở Quận 1, TP.HCM
    await seedRental({
      id: testId,
      title: 'Phòng Quận 1 HCM',
      priceStart: 2000,
      priceEnd: 4000,
      totalArea: 20,
      province: 'Hồ Chí Minh',
      district: 'Quận 1'
    });

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          provinceName: 'Hà Nội', // Tìm ở Hà Nội
          districtName: 'Quận 1' // Nhưng lại yêu cầu Quận 1
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0].data;
    const found = response.results.some((r: any) => r.post?.id === testId || r.id === testId);

    // Kết quả mong đợi: Không tìm thấy (vì không có Quận 1 nào ở Hà Nội)
    expect(found).toBe(false);
    expect(response.results.length).toBe(0);
  });

  test('TC_UNIT_LBV_SEARCHCON_33: Tên Phường không thuộc về Quận đã chọn', async () => {
    const testId = 777102;
    // Seed 1 bài ở Phường Đa Kao, Quận 1
    await seedRental({
      id: testId,
      title: 'Phòng Đa Kao Q1',
      priceStart: 2000,
      priceEnd: 4000,
      totalArea: 20,
      province: 'Hồ Chí Minh',
      district: 'Quận 1',
      ward: 'Đa Kao'
    });

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          districtName: 'Cầu Giấy', // Tìm ở Cầu Giấy
          wardName: 'Đa Kao' // Nhưng lại yêu cầu phường Đa Kao
        },
        orderConditions: {}
      }
    } as any;

    await searchPosts(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0].data;
    const found = response.results.some((r: any) => r.post?.id === testId || r.id === testId);

    expect(found).toBe(false);
  });

  test('TC_UNIT_LBV_SEARCHCON_34: Radius là số âm, bằng 0 hoặc chữ', async () => {
    const coords = { longitude: 105.8, latitude: 21.0 };

    // Case A: Radius âm
    const reqNegative = {
      params: { type: 'rental' },
      body: { whereConditions: { nearest: { ...coords, radius: -5 } } }
    } as any;
    await searchPosts(reqNegative, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));

    // Case B: Radius = 0 (Không tìm thấy gì hoặc báo lỗi)
    const reqZero = {
      params: { type: 'rental' },
      body: { whereConditions: { nearest: { ...coords, radius: 0 } } }
    } as any;
    await searchPosts(reqZero, mockRes, next);
    // Kiểm tra xem có gọi json không, nếu không thì kiểm tra next
    if (mockRes.json.mock.calls.length > 0) {
      const response = mockRes.json.mock.calls[0][0].data;
      expect(response.results.length).toBe(0);
    } else {
      // Nếu không gọi json, chắc chắn phải gọi next với lỗi
      expect(next).toHaveBeenCalled();
    }

    // Case C: Radius là chữ
    const reqChar = {
      params: { type: 'rental' },
      body: { whereConditions: { nearest: { ...coords, radius: 'gần-đây' } } }
    } as any;
    await searchPosts(reqChar, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));
  });

  test('TC_UNIT_LBV_SEARCHCON_35: Price và Area bằng 0', async () => {
    const testId = 777201;
    // Seed 1 bài có giá 0 (miễn phí) và diện tích nhỏ
    await seedRental({
      id: testId,
      title: 'Ở ghép miễn phí',
      priceStart: 0,
      priceEnd: 0,
      totalArea: 10
    });

    const req = {
      params: { type: 'rental' },
      body: {
        whereConditions: {
          priceStart: 0,
          priceEnd: 1000000,
          totalAreaStart: 0
        }
      }
    } as any;

    await searchPosts(req, mockRes, next);
    // Kiểm tra xem res.json có được gọi không
    expect(mockRes.json).toHaveBeenCalled();

    if (mockRes.json.mock.calls.length > 0) {
      const response = mockRes.json.mock.calls[0][0].data;
      const found = response.results.some((r: any) => r.post?.id === testId || r.id === testId);
      expect(found).toBe(true);
    } else {
      // Nếu không gọi json, chắc chắn phải gọi next với lỗi
      expect(next).toHaveBeenCalled();
    }
  });
});
