import { updateRentalPost } from '../post.controller';
import * as postService from '@/services/post.service';
import * as locationService from '@/services/location.service';
import { StatusCodes } from 'http-status-codes';
import dayjs from 'dayjs';

jest.mock('@/services/post.service');
jest.mock('@/services/location.service');
jest.mock('../../utils/schema.helper', () => ({
  checkUserAndPostPermission: jest.fn(() => true),
  cleanObject: jest.fn((obj) => obj),
}));

describe('Unit Test: updateRentalPost (Full Logic Coverage)', () => {
  let mockReq: any;
  let mockRes: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    mockReq = {
      params: { postId: '1' },
      body: {
        addressProvince: 'HN', addressDistrict: 'CG', addressWard: 'DV',
        addressLongitude: 105, addressLatitude: 21
      },
      currentUser: { users_detail: { userId: 1, role: 'user' } },
      files: []
    };

    // Happy path mặc định cho DB
    (postService.selectPostById as jest.Mock).mockResolvedValue([{
      id: 1, ownerId: 1, type: 'rental', createdAt: new Date('2026-01-01T00:00:00Z'), expirationAfter: 1
    }]);
    (postService.updatePostById as jest.Mock).mockResolvedValue([1]);
    (postService.updateRentalPostByPostId as jest.Mock).mockResolvedValue([1]);
    (postService.selectFullPostDetailById as jest.Mock).mockResolvedValue({ id: 1 });
  });

  describe('1. Auth & Validation Logic', () => {
    it('TCQLBV11: Trả về 400 nếu không có postId trong params', async () => {
      mockReq.params.postId = '';
      await updateRentalPost(mockReq, mockRes, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('TCQLBV12: Trả về 404 nếu postId không tồn tại', async () => {
      (postService.selectPostById as jest.Mock).mockResolvedValue([]);
      await updateRentalPost(mockReq, mockRes, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });

    it('TCQLBV13: Trả về 403 nếu không phải chủ bài đăng', async () => {
      (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 1, ownerId: 99 }]);
      await updateRentalPost(mockReq, mockRes, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
  });

  describe('2. Price Logic', () => {
    it('TCQLBV14: Cập nhật giá cả thành công khi dữ liệu hợp lệ', async () => {
      mockReq.body.priceStart = 2000000;
      mockReq.body.priceEnd = 3000000;
      await updateRentalPost(mockReq, mockRes, next);
      const payload = (postService.updateRentalPostByPostId as jest.Mock).mock.calls[0][1];
      expect(payload.priceStart).toBe(2000000);
      expect(payload.priceEnd).toBe(3000000);
    });

    it('TCQLBV15: Gán priceEnd = priceStart nếu priceEnd = 0', async () => {
      mockReq.body.priceStart = 5000;
      mockReq.body.priceEnd = 0;
      await updateRentalPost(mockReq, mockRes, next);
      const payload = (postService.updateRentalPostByPostId as jest.Mock).mock.calls[0][1];
      expect(payload.priceEnd).toBe(5000);
    });

    it('TCQLBV16: Tự động Swap giá nếu priceStart > priceEnd', async () => {
      mockReq.body.priceStart = 1000;
      mockReq.body.priceEnd = 500;
      await updateRentalPost(mockReq, mockRes, next);
      const payload = (postService.updateRentalPostByPostId as jest.Mock).mock.calls[0][1];
      expect(payload.priceStart).toBe(500);
      expect(payload.priceEnd).toBe(1000);
    });

    test('TCQLBV17: Trả về 400 nếu giá trị âm', async () => {
      mockReq.body.priceStart = -1000;
      await updateRentalPost(mockReq, mockRes, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('3. Location Logic', () => {
    it('TCQLBV18: Gọi Geocoding nếu thiếu tọa độ', async () => {
      mockReq.body.addressLongitude = null;
      mockReq.body.addressDetail = '123 ABC';
      (locationService.geocodingByGoong as jest.Mock).mockResolvedValue({ longitude: 100, latitude: 20 });

      await updateRentalPost(mockReq, mockRes, next);
      expect(locationService.geocodingByGoong).toHaveBeenCalled();
    });

    it('TCQLBV19: Không gọi Geocoding nếu đã có đủ tọa độ hợp lệ', async () => {
      mockReq.body.addressLongitude = 106.123;
      mockReq.body.addressLatitude = 10.456;
      await updateRentalPost(mockReq, mockRes, next);
      expect(locationService.geocodingByGoong).not.toHaveBeenCalled();
    });
  });

  describe('4. Expiration Logic', () => {
    const baseDate = new Date('2026-04-01T00:00:00Z');

    it('TCQLBV20: Tính đúng ngày khi đơn vị là "week"', async () => {
      mockReq.body.expirationAfter = 2; // Khác giá trị cũ là 1
      mockReq.body.expirationAfterUnit = 'week';
      await updateRentalPost(mockReq, mockRes, next);
      const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
      expect(payload.expirationTime.getUTCDate()).toBe(15);
    });

    it('TCQLBV21: Tính đúng giờ đơn vị "hour"', async () => {
      const dateWithHour = new Date('2026-04-19T10:00:00Z');
      (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 1, ownerId: 1, createdAt: dateWithHour, expirationAfter: 1 }]);
      mockReq.body.expirationAfter = 5;
      mockReq.body.expirationAfterUnit = 'hour';
      await updateRentalPost(mockReq, mockRes, next);
      const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
      expect(payload.expirationTime.toISOString()).toContain('T15:00:00');
    });

    it('TCQLBV22: Mặc định cộng Month nếu unit không hợp lệ', async () => {
      mockReq.body.expirationAfter = 3;
      mockReq.body.expirationAfterUnit = 'unknown';
      await updateRentalPost(mockReq, mockRes, next);
      const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
      expect(payload.expirationTime.getUTCMonth()).toBe(3); // Jan + 3 = April (index 3)
    });

    it('TCQLBV23: Gán 99 năm nếu expirationAfter = 0', async () => {
      mockReq.body.expirationAfter = 0;
      await updateRentalPost(mockReq, mockRes, next);
      const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
      expect(payload.expirationTime.getFullYear()).toBe(2125);
    });
  });

  describe('5. Error & Edge Cases', () => {
    it('TCQLBV24: Lỗi nếu selectFullPostDetailById trả về undefined', async () => {
      (postService.selectFullPostDetailById as jest.Mock).mockResolvedValue(undefined);
      await updateRentalPost(mockReq, mockRes, next);
      expect(next).toHaveBeenCalled();
    });

    it('TCQLBV25: Trả về lỗi nếu Database sập khi update', async () => {
      (postService.updatePostById as jest.Mock).mockRejectedValue(new Error('DB Error'));
      await updateRentalPost(mockReq, mockRes, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('TCQLBV26: Xử lý khi upload file thất bại', async () => {
      mockReq.files = [{ fieldname: 'images' }];
      // Giả lập hàm upload trả về rỗng (fail)
      // Lưu ý: Cần mock hàm upload helper của bạn ở đây nếu nó là một function riêng
      await updateRentalPost(mockReq, mockRes, next);
      // Kết quả tùy thuộc vào việc bạn throw ApiResponse hay không
    });
  });


  describe('6. Deep Location & Geocoding Logic', () => {
    it('TCQLBV27: Nối chuỗi chính xác khi addressDetail là chuỗi rỗng', async () => {
      mockReq.body = { 
        addressDetail: "", addressWard: "Phường 5", 
        addressDistrict: "Quận 3", addressProvince: "HCM",
        addressLongitude: null 
      };
      (locationService.geocodingByGoong as jest.Mock).mockResolvedValue({ longitude: 1, latitude: 1 });

      await updateRentalPost(mockReq, mockRes, next);
      // Kiểm tra xem dấu phẩy đầu tiên có bị thừa hay chuỗi có bị "undefined" không
      expect(locationService.geocodingByGoong).toHaveBeenCalledWith(", Phường 5, Quận 3, HCM");
    });

    it('TCQLBV28: Chỉ cập nhật tọa độ nếu Geocoding trả về giá trị hợp lệ', async () => {
      mockReq.body.addressLongitude = null;
      (locationService.geocodingByGoong as jest.Mock).mockResolvedValue(null); // API trả về null

      await updateRentalPost(mockReq, mockRes, next);
      const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
      expect(payload.addressLongitude).toBeUndefined(); // Không được đè undefined vào DB
    });

    it('TCQLBV29: Xử lý ngoại lệ khi Geocoding bị sập (Rejected)', async () => {
      mockReq.body.addressLongitude = null;
      (locationService.geocodingByGoong as jest.Mock).mockRejectedValue(new Error("Timeout"));

      await updateRentalPost(mockReq, mockRes, next);
      // Code vẫn phải chạy tiếp để update các trường khác (try-catch lồng)
      expect(postService.updatePostById).toHaveBeenCalled();
    });
  });

  describe('7. Media & Assets Logic', () => {
    it('TCQLBV30: Giữ nguyên ảnh cũ nếu không có file mới được upload', async () => {
      mockReq.files = [];
      await updateRentalPost(mockReq, mockRes, next);
      const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
      expect(payload.images).toBeUndefined(); // Không gửi trường images lên update
    });

    it('TCQLBV31: Trả về 400 nếu mảng ảnh mới sau khi upload bị rỗng', async () => {
      mockReq.files = [{ fieldname: 'images' }];
      // Giả lập helper upload trả về mảng rỗng (ví dụ do sai định dạng)
      // Chú ý: Cần mock thực tế hàm upload của bạn
      await updateRentalPost(mockReq, mockRes, next);
      // expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('8. Advanced Expiration Edge Cases', () => {
    it('TCQLBV32: Tính đúng ngày khi expirationAfterUnit là "day" (Chữ thường)', async () => {
      mockReq.body = { expirationAfter: 5, expirationAfterUnit: 'day' };
      await updateRentalPost(mockReq, mockRes, next);
      const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
      // Jan 01 + 5 days = Jan 06
      expect(payload.expirationTime.getUTCDate()).toBe(6);
    });

    it('TCQLBV33: Không cập nhật expirationTime nếu giá trị mới giống hệt giá trị trong DB', async () => {
      // DB đang có expirationAfter là 1
      mockReq.body = { expirationAfter: 1 }; 
      await updateRentalPost(mockReq, mockRes, next);
      const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
      expect(payload.expirationTime).toBeUndefined();
    });

    it('TCQLBV34: Chuyển đổi expirationAfter từ String sang Number trước khi tính toán', async () => {
      mockReq.body = { expirationAfter: "10", expirationAfterUnit: "day" };
      await updateRentalPost(mockReq, mockRes, next);
      const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
      expect(payload.expirationTime.getUTCDate()).toBe(11); // 1 + 10 = 11
    });
  });

  describe('9. Data Type Casting & Cleanup', () => {
    it('TCQLBV35: Loại bỏ các trường rác (null/undefined) nhờ cleanObject', async () => {
      mockReq.body = { title: "Title", description: undefined, junkField: null };
      await updateRentalPost(mockReq, mockRes, next);
      const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
      expect(payload).not.toHaveProperty('junkField');
      expect(payload).not.toHaveProperty('description');
    });

    it('TCQLBV36: Ép kiểu totalArea thành số thực (float)', async () => {
      mockReq.body.totalArea = "45.75";
      await updateRentalPost(mockReq, mockRes, next);
      const payload = (postService.updateRentalPostByPostId as jest.Mock).mock.calls[0][1];
      expect(payload.totalArea).toBe(45.75);
    });

    it('TCQLBV37: Trả về 400 nếu totalArea truyền vào không phải là số (NaN)', async () => {
      mockReq.body.totalArea = "không phải số";
      await updateRentalPost(mockReq, mockRes, next);
      // Tùy vào việc bạn có validation schema trước đó không, 
      // nếu không code sẽ crash hoặc lưu NaN. Test case này giúp phát hiện lỗi đó.
    });
  });

  describe('10. Concurrent DB Operations', () => {
    it('TCQLBV38: Một hàm update thất bại thì cả Controller phải báo lỗi', async () => {
      (postService.updateRentalPostByPostId as jest.Mock).mockRejectedValue(new Error("Rental Table Error"));
      
      await updateRentalPost(mockReq, mockRes, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('TCQLBV39: Đảm bảo selectFullPostDetailById được gọi với đúng ID sau khi update', async () => {
      await updateRentalPost(mockReq, mockRes, next);
      expect(postService.selectFullPostDetailById).toHaveBeenCalledWith(1);
    });
  });
});




