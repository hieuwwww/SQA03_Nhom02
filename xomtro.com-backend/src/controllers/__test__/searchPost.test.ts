import { searchPosts } from '../post.controller'; // Điều chỉnh đường dẫn thực tế
import * as postService from '@/services/post.service';
import ApiError from '@/utils/ApiError.helper';
import { postType, postStatus } from '@/types/schema.type';
import { StatusCodes } from 'http-status-codes';

// Mock các dependencies
jest.mock('@/services/post.service');
jest.mock('@/utils/constants.helper', () => ({
  generateSlug: jest.fn((str) => str.toLowerCase().replace(/ /g, '-')),
}));
jest.mock('@/utils/schema.helper', () => ({
  paginationHelper: jest.fn((data) => data),
}));

describe('Unit Test: searchPosts Controller', () => {
  let mockRequest: any;
  let mockResponse: any;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      params: {},
      body: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  // --- NHÁNH LỖI NHẬP LIỆU (VALIDATION BRANCHES) ---

  it('TCLBV1: Kiểm tra throw error nếu thiếu whereConditions hoặc orderConditions', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = { whereConditions: null }; // Thiếu orderConditions

    await searchPosts(mockRequest, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
    const error = nextFunction.mock.calls[0][0];
    expect(error.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  it('TCLBV2: Kiểm tra throw error nếu type post không hợp lệ', async () => {
    mockRequest.params.type = 'INVALID_TYPE';
    mockRequest.body = { whereConditions: {}, orderConditions: {} };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
    expect(nextFunction.mock.calls[0][0].message).toBe('Invalid post type parameter');
  });

  it('TCLBV3 : Kiểm tra throw error nếu status không hợp lệ', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { status: 'TRASH_STATUS' },
      orderConditions: {}
    };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
    expect(nextFunction.mock.calls[0][0].statusCode).toBe(StatusCodes.BAD_REQUEST);
  });

  it('TCLBV4: Kiểm tra throw error nếu có nearest nhưng thiếu longitude/latitude', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { nearest: { longitude: 106.1 } }, // Thiếu latitude
      orderConditions: {}
    };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
    expect(nextFunction.mock.calls[0][0].message).toContain('Longitude and latitude are required');
  });

  // --- NHÁNH XỬ LÝ LOGIC (LOGIC BRANCHES) ---

  it('TCLBV5: Kiểm tra việc đảo ngược totalAreaStart và totalAreaEnd nếu start > end', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { totalAreaStart: 100, totalAreaEnd: 50 },
      orderConditions: {}
    };

    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    // Kiểm tra xem service có được gọi với [50, 100] thay vì [100, 50] không
    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];
    expect(calledArgs.totalArea.value).toEqual([50, 100]);
  });

  // --- NHÁNH THÀNH CÔNG (SUCCESS BRANCHES PER TYPE) ---

  it('TCLBV6: Kiểm tra việc gọi selectRentalPostByConditions khi type là RENTAL và trả về 200', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { title: 'Phong tro' },
      orderConditions: { price: 'asc' },
      pagination: { page: 1, pageSize: 10 }
    };

    const mockData = [{ id: 1, title: 'Phong tro 1' }];
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue(mockData);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    expect(postService.selectRentalPostByConditions).toHaveBeenCalledTimes(2); // 1 cho search, 1 cho total
    expect(mockResponse.status).toHaveBeenCalledWith(StatusCodes.OK);
  });

  it('TCLBV7: Kiểm tra việc gọi selectJoinPostByConditions khi type là JOIN', async () => {
    mockRequest.params.type = postType.JOIN;
    mockRequest.body = { whereConditions: {}, orderConditions: {} };
    (postService.selectJoinPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    expect(postService.selectJoinPostByConditions).toHaveBeenCalled();
  });


  // --- NHÁNH GIÁ CẢ (PRICE LOGIC) ---

  it('TCLBV8: Kiểm tra việc gán priceStart vào query với operator gte', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { priceStart: 5000000 },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];
    expect(calledArgs.priceStart).toEqual({ operator: 'gte', value: 5000000 });
  });

  it('TCLBV9: Kiểm tra việc gán priceEnd vào query với operator lte', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { priceEnd: 10000000 },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];
    expect(calledArgs.priceEnd).toEqual({ operator: 'lte', value: 10000000 });
  });

  // --- NHÁNH DIỆN TÍCH (AREA LOGIC - ĐIỀU KIỆN CON) ---

  it('TCLBV10: Kiểm tra việc xử lý khi chỉ có totalAreaStart mà không có totalAreaEnd', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { totalAreaStart: 30 },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];
    // Logic trong code: value: [totalAreaStart, totalAreaEnd ? totalAreaEnd : totalAreaStart]
    // Expected: [30, 30]
    expect(calledArgs.totalArea.value).toEqual([30, 30]);
  });

  it('TCLBV11: Kiểm tra việc đảo ngược diện tích khi start > end (Swap logic)', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { totalAreaStart: 100, totalAreaEnd: 20 },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];
    expect(calledArgs.totalArea.value).toEqual([20, 100]);
  });

  // --- NHÁNH NGÀY THÁNG (DATE VALIDATION) ---

  it('TCLBV12: Kiểm tra throw error nếu dateStart không đúng định dạng ngày tháng', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { dateStart: 'ngay-mai-tuoi-sang' }, // Invalid date
      orderConditions: {}
    };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
    expect(nextFunction.mock.calls[0][0].message).toBe('dateStart value is invalid');
  });

  it('TCLBV13: Kiểm tra việc lấy thời gian hiện tại của Việt Nam nếu có dateStart nhưng thiếu dateEnd', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { dateStart: '2023-01-01' },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];
    expect(calledArgs.updatedAt.operator).toBe('between');
    expect(calledArgs.updatedAt.value[0]).toBeInstanceOf(Date);
    // value[1] phải là kết quả của timeInVietNam().toDate()
    expect(calledArgs.updatedAt.value[1]).toBeDefined();
  });

  // --- NHÁNH VỊ TRÍ (NEAREST) ---

  it('TCLBV14: Kiểm tra việc gán radius mặc định là 50 nếu nearest được cung cấp nhưng thiếu radius', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { nearest: { longitude: 10, latitude: 20 } },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];
    expect(calledArgs.radius).toBe(50);
  });

  // Test Case: Thiếu Longitude
  it('TCLBV15: Kiểm tra throw error nếu nearest có latitude nhưng thiếu longitude', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { nearest: { latitude: 10.123 } }, // Thiếu longitude
      orderConditions: {}
    };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
    expect(nextFunction.mock.calls[0][0].message).toContain('Longitude and latitude are required');
  });

  // Test Case: Thiếu Latitude
  it('TCLBV16: Kiểm tra throw error nếu nearest có longitude nhưng thiếu latitude', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { nearest: { longitude: 106.456 } }, // Thiếu latitude
      orderConditions: {}
    };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
    expect(nextFunction.mock.calls[0][0].statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  // Test Case: Có đủ tọa độ và có radius tùy chỉnh
  it('TCLBV17: Kiểm tra gán đúng tọa độ và radius khi người dùng nhập đủ', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { nearest: { longitude: 106.1, latitude: 10.2, radius: 100 } },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];
    expect(calledArgs.addressLongitude.value).toBe(106.1);
    expect(calledArgs.addressLatitude.value).toBe(10.2);
    expect(calledArgs.radius).toBe(100);
  });


  it('TCLBV18: Kiểm tra map đúng các thuộc tính tiện ích sang operator eq: true', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: {
        hasFurniture: true,
        hasElevator: true,
        allowPets: true
      },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];

    expect(calledArgs.hasFurniture).toEqual({ operator: 'eq', value: true });
    expect(calledArgs.hasElevator).toEqual({ operator: 'eq', value: true });
    expect(calledArgs.allowPets).toEqual({ operator: 'eq', value: true });
    // Đảm bảo các thuộc tính không gửi thì không có trong 'where'
    expect(calledArgs.hasInternet).toBeUndefined();
  });

  it('TCLBV19: Kiểm tra format đúng điều kiện LIKE cho tỉnh và quận huyện', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: {
        provinceName: 'Hồ Chí Minh',
        districtName: 'Quận 1'
      },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];

    expect(calledArgs.addressProvince).toEqual({ operator: 'like', value: '%Hồ Chí Minh%' });
    expect(calledArgs.addressDistrict).toEqual({ operator: 'like', value: '%Quận 1%' });
  });


  // --- KIỂM THỬ GIÁ CẢ (PRICE) ---
  it('TCLBV20: Kiểm tra ép kiểu string sang number thành công cho priceStart và priceEnd', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: {
        priceStart: "5000000", // Gửi dạng string từ client
        priceEnd: "15000000"
      },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];

    // Expected: Phải được ép về kiểu number
    expect(typeof calledArgs.priceStart.value).toBe('number');
    expect(calledArgs.priceStart.value).toBe(5000000);
    expect(calledArgs.priceEnd.value).toBe(15000000);
  });

  it('TCLBV21: Kiểm tra xử lý trường hợp priceStart là giá trị không hợp lệ (NaN)', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { priceStart: "không phải số" },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];
    // Với Number("không phải số"), kết quả là NaN. 
    // Tùy vào yêu cầu DB, bạn có thể cân nhắc throw error sớm hoặc để DB xử lý.
    expect(calledArgs.priceStart.value).toBeNaN();
  });

  // --- KIỂM THỬ DIỆN TÍCH (AREA) ---
  it('TCLBV22: Kiểm tra xử lý diện tích khi nhập số thực (float)', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { totalAreaStart: 20.5, totalAreaEnd: 50.75 },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];
    expect(calledArgs.totalArea.value).toEqual([20.5, 50.75]);
  });

  // --- KIỂM THỬ OWNER ID ---
  it('TCLBV23: Kiểm tra ép kiểu ownerId sang số nguyên', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { ownerId: "123" },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];
    expect(calledArgs.ownerId.value).toBe(123);
    expect(typeof calledArgs.ownerId.value).toBe('number');
  });

  it('TCLBV24: Kiểm tra logic khi totalAreaStart bằng 0', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { totalAreaStart: 0, totalAreaEnd: 100 },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];

    // Lưu ý: Trong JS, if(0) là false. Nếu code dùng `if (totalAreaStart)`, 
    // thì giá trị 0 sẽ bị bỏ qua. Test này để kiểm tra xem hệ thống có bị "nuốt" mất số 0 không.
    // Dựa trên code của bạn: `...(totalAreaStart && { ... })` -> Số 0 SẼ BỊ BỎ QUA.
    expect(calledArgs.totalArea).toBeUndefined();
  });


  // Test Case: Lọc diện tích kèm đơn vị cụ thể
  it('TCLBV25: Kiểm tra gán đúng totalArea và totalAreaUnit khi cả hai cùng tồn tại', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: {
        totalAreaStart: 50,
        totalAreaEnd: 100,
        totalAreaUnit: 'm2'
      },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];

    // Kiểm tra diện tích (mảng [min, max])
    expect(calledArgs.totalArea).toEqual({ operator: 'between', value: [50, 100] });
    // Kiểm tra đơn vị (phải dùng operator eq)
    expect(calledArgs.totalAreaUnit).toEqual({ operator: 'eq', value: 'm2' });
  });

  // Test Case: Chỉ gửi đơn vị mà không gửi giá trị diện tích
  it('TCLBV26: Kiểm tra gán totalAreaUnit ngay cả khi không có totalAreaStart/End', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { totalAreaUnit: 'ha' },
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];

    expect(calledArgs.totalArea).toBeUndefined();
    expect(calledArgs.totalAreaUnit).toEqual({ operator: 'eq', value: 'ha' });
  });

  // Test Case: Kiểm tra tính nhạy cảm của kiểu dữ liệu (Data Type Sensitivity)
  it('TCLBV27: Kiểm tra xử lý totalAreaUnit là một chuỗi rỗng hoặc null', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: { totalAreaUnit: "" }, // Falsy value
      orderConditions: {}
    };
    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];
    // Với logic ...(totalAreaUnit && { ... }), chuỗi rỗng sẽ bị loại bỏ
    expect(calledArgs.totalAreaUnit).toBeUndefined();
  });

  it('TCLBV28: Kiểm tra giữ lại filter priceStart khi giá trị bằng 0', async () => {
    mockRequest.body.whereConditions = { priceStart: 0 };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const where = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];

    // EXPECTED: priceStart: { operator: 'gte', value: 0 }
    // ACTUAL: priceStart bị undefined (do 0 && { ... } trả về 0 - falsy)
    expect(where.priceStart).toBeDefined();
    expect(where.priceStart.value).toBe(0);
  });

  it('TCLBV29: Kiểm tra xử lý được tọa độ bằng 0', async () => {
    mockRequest.body.whereConditions = {
      nearest: { longitude: 0, latitude: 0 }
    };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const where = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];

    // EXPECTED: addressLongitude.value = 0
    // ACTUAL: Code hiện tại dùng nearest?.longitude (0 là falsy) nên field này biến mất
    expect(where.addressLongitude.value).toBe(0);
  });

  it('TCLBV30: Kiểm tra throw error khi whereConditions là một mảng thay vì object', async () => {
    mockRequest.body = {
      whereConditions: [1, 2, 3], // Gửi mảng thay vì object
      orderConditions: {}
    };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    // EXPECTED: Phải ném lỗi vì không thể truy cập title, status từ mảng
    // ACTUAL: Code có thể chạy tiếp và crash ở đoạn generateSlug(title) vì title undefined
    expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
  });

  it('TCLBV31: Kiểm tra tự động đảo ngược nếu dateStart lớn hơn dateEnd', async () => {
    mockRequest.body.whereConditions = {
      dateStart: '2025-01-01',
      dateEnd: '2023-01-01'
    };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const where = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];
    const dateValue = where.updatedAt.value;

    // EXPECTED: [Date(2023), Date(2025)]
    // ACTUAL: [Date(2025), Date(2023)] -> Query lỗi logic
    expect(dateValue[0].getTime()).toBeLessThan(dateValue[1].getTime());
  });

  it('TCLBV32: Kiểm tra việc nhận giá trị radius = 0 thay vì dùng mặc định là 50', async () => {
    mockRequest.params.type = postType.RENTAL;
    mockRequest.body = {
      whereConditions: {
        nearest: {
          longitude: 106.660172,
          latitude: 10.762622,
          radius: 0  // Giá trị kiểm thử
        }
      },
      orderConditions: {}
    };

    (postService.selectRentalPostByConditions as jest.Mock).mockResolvedValue([]);

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const calledArgs = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];

    // EXPECTED OUTPUT: radius phải là 0
    // ACTUAL OUTPUT: radius sẽ là 50 (do logic nearest?.radius ? ... : 50)
    expect(calledArgs.radius).toBe(0);
  });

  it('TCLBV33: Kiểm tra Radius gửi dạng chuỗi "0" hoặc "100"', async () => {
    mockRequest.body.whereConditions = {
      nearest: { longitude: 106, latitude: 10, radius: "100" }
    };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const where = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];

    // EXPECTED: radius là kiểu number (100)
    // ACTUAL: radius là kiểu string ("100") -> Có thể gây lỗi khi thực hiện toán tử cộng/trừ trong DB query
    expect(typeof where.radius).toBe('number');
  });

  it('TCLBV34: Kiểm tra Radius không được phép là số âm', async () => {
    mockRequest.body.whereConditions = {
      nearest: { longitude: 106, latitude: 10, radius: -50 }
    };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    // EXPECTED: Phải ném lỗi 422 Unprocessable Entity
    // ACTUAL: Code vẫn chạy và gán radius = -50 vào query
    expect(nextFunction).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.UNPROCESSABLE_ENTITY })
    );
  });

  it('TCLBV35: Kiểm tra tọa độ vượt quá giới hạn địa lý', async () => {
    mockRequest.body.whereConditions = {
      nearest: { longitude: 200, latitude: 100 } // Không tồn tại trên Trái Đất
    };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    // EXPECTED: Phải ném lỗi BadRequest hoặc Unprocessable Entity
    // ACTUAL: Code vẫn pass và gửi tọa độ rác vào Database
    expect(nextFunction).toHaveBeenCalledWith(expect.any(ApiError));
  });


  it('TCLBV36: Kiểm tra hệ thống bỏ qua filter khi diện tích bắt đầu bằng 0', async () => {
    mockRequest.body.whereConditions = { totalAreaStart: 0, totalAreaEnd: 50 };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const where = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];

    // EXPECTED: totalArea: { operator: 'between', value: [0, 50] }
    // ACTUAL: totalArea bị UNDEFINED vì (totalAreaStart && {...}) là false khi start = 0
    expect(where.totalArea).toBeDefined();
    expect(where.totalArea.value[0]).toBe(0);
  });

  it('TCLBV37: Kiểm tra gửi giá trị không phải số (NaN) vào Database', async () => {
    mockRequest.body.whereConditions = { priceStart: "chuỗi_độc_hại" };

    await searchPosts(mockRequest, mockResponse, nextFunction);

    const where = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];

    // EXPECTED: Phải throw ApiError 422 hoặc lọc bỏ giá trị rác
    // ACTUAL: Gửi { value: NaN } xuống SQL, có thể gây lỗi Query hoặc kết quả sai
    expect(where.priceStart.value).not.toBeNaN();
  });


});
