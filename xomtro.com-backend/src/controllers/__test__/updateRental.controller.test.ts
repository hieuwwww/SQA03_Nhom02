import { StatusCodes } from 'http-status-codes';
import { updateRentalPost } from '../post.controller';
import { db } from '@/configs/database.config';
import { posts, rentalPosts, users } from '@/models/schema';
import { eq } from 'drizzle-orm';
import ApiError from '@/utils/ApiError.helper';
import * as geocodingService from '@/services/location.service';
import dayjs from 'dayjs';
import * as PostCon from '@/controllers/post.controller';


describe('Unit Test: updateRentalPost', () => {
    let mockRes: any;
    let next: any;

    const OWNER_ID = 1111;
    const POST_ID = 2222;

    const setupData = async () => {
        // Xóa dữ liệu cũ để tránh conflict
        await db.delete(rentalPosts).where(eq(rentalPosts.postId, POST_ID));
        await db.delete(posts).where(eq(posts.id, POST_ID));
        await db.delete(users).where(eq(users.id, OWNER_ID));

        // Insert dữ liệu mẫu
        await db.insert(users).values({ id: OWNER_ID, name: 'Owner', email: 'update@test.com', password: '123' });
        await db.insert(posts).values({
            id: POST_ID,
            title: 'Tiêu đề cũ',
            ownerId: OWNER_ID,
            type: 'rental',
            createdAt: new Date(),
            addressDistrict: 'Cầu Giấy',
            addressProvince: 'Hà Nội',
            addressWard: 'Dịch Vọng'
        });
        await db.insert(rentalPosts).values({
            postId: POST_ID,
            priceStart: 5000000,
            priceEnd: 7000000,
            totalArea: 30,
            minLeaseTerm: 12,
            minLeaseTermUnit: 'month',
            hasFurniture: false,
            allowPets: true
        });
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
        next = jest.fn();
        await setupData();
    });

    afterEach(async () => {
        await db.delete(rentalPosts).where(eq(rentalPosts.postId, POST_ID));
        await db.delete(posts).where(eq(posts.id, POST_ID));
        await db.delete(users).where(eq(users.id, OWNER_ID));
    });

    // --- NHÁNH 1: THÀNH CÔNG & LOGIC HOÁN ĐỔI GIÁ ---

    test('TC_UNIT_QLBV_UPDATERENTAL_01: Cập nhật thành công và tự động hoán đổi nếu priceStart > priceEnd', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: {
                title: 'Tiêu đề mới đã đổi',
                priceStart: 10, // Start lớn hơn End
                priceEnd: 5,
                addressProvince: 'Hà Nội',
                addressDistrict: 'Cầu Giấy',
                addressWard: 'Dịch Vọng',
                addressLongitude: 105.123, // Đã có Long/Lat nên không gọi Geocoding
                addressLatitude: 21.123
            }
        } as any;

        await updateRentalPost(req, mockRes, next);
        const response = mockRes.json.mock.calls[0][0];
        // 1. Kiểm tra mã trạng thái và message    
        expect(response.statusCode).toBe(StatusCodes.OK);

        // Kiểm tra DB thật sau khi update
        const [updatedPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));
        const [updatedDetail] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, POST_ID));

        expect(updatedPost.title).toBe('Tiêu đề mới đã đổi');
        // Kiểm tra logic hoán đổi giá: Start phải thành 5, End phải thành 10
        expect(updatedDetail.priceStart).toBe(5);
        expect(updatedDetail.priceEnd).toBe(10);
        expect(mockRes.json).toHaveBeenCalled();
    });

    test('TC_UNIT_QLBV_UPDATERENTAL_02: Cập nhật khi priceEnd là null (priceEnd sẽ bằng priceStart)', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: {
                priceStart: 3000000,
                priceEnd: null
            }
        } as any;

        await updateRentalPost(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];

        // 1. Kiểm tra mã trạng thái và message
        expect(response.statusCode).toBe(StatusCodes.OK);

        const [updatedDetail] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, POST_ID));
        expect(updatedDetail.priceEnd).toBe(3000000); // priceEnd = priceStart
    });


    // --- NHÁNH 6: KIỂM THỬ LOGIC THỜI GIAN HẾT HẠN (EXPIRATION) ---

    test('TC_UNIT_QLBV_UPDATERENTAL_03: Gia hạn bài viết với đơn vị HOUR', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: {
                title: 'Cập nhật hạn mới',
                priceStart: 4000000,
                expirationAfter: 5,
                expirationAfterUnit: 'hour' // Nhánh hour
            }
        } as any;

        await updateRentalPost(req, mockRes, next);

        if (next.mock.calls.length > 0) throw next.mock.calls[0][0];

        const response = mockRes.json.mock.calls[0][0];
        const data = response.data[0];

        // Kiểm tra DB thật: createdAt + 5 giờ
        const [dbPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));

        const expectedTime = dayjs(dbPost.updatedAt).add(5, 'hour');

        // 2. Lấy thời gian thực tế từ DB
        const actualTime = dayjs(dbPost.expirationTime);

        // 3. So sánh độ lệch theo giây (second) thay vì mili-giây
        // .diff trả về giá trị chênh lệch, ta lấy trị tuyệt đối để đảm bảo khoảng cách < 2 giây
        const diffInSeconds = Math.abs(actualTime.diff(expectedTime, 'second'));

        expect(diffInSeconds).toBeLessThanOrEqual(1);


    });

    test('TC_UNIT_QLBV_UPDATERENTAL_04: Gia hạn bài viết với đơn vị WEEK', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: {
                title: 'Cập nhật hạn mới',
                price: 4000000,
                expirationAfter: 2,
                expirationAfterUnit: 'week' // Nhánh week
            }
        } as any;

        await updateRentalPost(req, mockRes, next);
        if (next.mock.calls.length > 0) throw next.mock.calls[0][0];

        const [dbPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));

        const expectedTime = dayjs(dbPost.updatedAt).add(2, 'week');

        // 2. Lấy thời gian thực tế từ DB
        const actualTime = dayjs(dbPost.expirationTime);

        // 3. So sánh độ lệch theo giây (second) thay vì mili-giây
        // .diff trả về giá trị chênh lệch, ta lấy trị tuyệt đối để đảm bảo khoảng cách < 2 giây
        const diffInSeconds = Math.abs(actualTime.diff(expectedTime, 'second'));

        expect(diffInSeconds).toBeLessThanOrEqual(1);
    });

    test('TC_UNIT_QLBV_UPDATERENTAL_05: Đơn vị mặc định (DAY) khi truyền unit sai hoặc để trống', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: {
                title: 'Cập nhật hạn mới',
                price: 4000000,
                expirationAfter: 3,
                expirationAfterUnit: '' // Trống -> mặc định 'day'
            }
        } as any;

        await updateRentalPost(req, mockRes, next);
        if (next.mock.calls.length > 0) throw next.mock.calls[0][0];

        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(StatusCodes.OK);

        const data = mockRes.json.mock.calls[0][0].data[0];


        const [dbPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));

        // 1. Tính toán thời gian kỳ vọng (99 năm kể từ lúc updatedAt/createdAt)
        const expectedTime = dayjs(dbPost.updatedAt).add(3, 'day');

        // 2. Lấy thời gian thực tế từ DB
        const actualTime = dayjs(dbPost.expirationTime);

        // 3. So sánh độ lệch theo giây (second) thay vì mili-giây
        // .diff trả về giá trị chênh lệch, ta lấy trị tuyệt đối để đảm bảo khoảng cách < 2 giây
        const diffInSeconds = Math.abs(actualTime.diff(expectedTime, 'second'));

        expect(diffInSeconds).toBeLessThanOrEqual(1);

    });

    test('TC_UNIT_QLBV_UPDATERENTAL_06: Trường hợp expirationAfter = 0 hoặc null (Vĩnh viễn/99 năm)', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: {
                title: 'Cập nhật vĩnh viễn',
                priceStart: 4000000,
                expirationAfter: 0 // Nhánh else if (!Number(expirationAfter))
            }
        } as any;

        await updateRentalPost(req, mockRes, next);
        if (next.mock.calls.length > 0) throw next.mock.calls[0][0];

        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(StatusCodes.OK);

        const [dbPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));

        // 1. Lấy năm hiện tại
        const currentYear = dayjs().get('year');

        // 2. Lấy năm từ DB trả về
        const expirationYear = dayjs(dbPost.expirationTime).get('year');

        // 3. Kiểm tra xem năm hết hạn có đúng là 99 năm sau không
        // (Cho phép sai số 1 năm nếu test chạy vào đúng khoảnh khắc giao thừa, nhưng thường là khớp 100%)
        expect(expirationYear).toBe(currentYear + 99);

        // Hoặc nếu nhóm muốn kiểm tra cả tháng cho chắc chắn
        expect(dayjs(dbPost.expirationTime).get('month')).toBe(dayjs().get('month'));
    });

    test('TC_UNIT_QLBV_UPDATERENTAL_07: Không thay đổi nếu expirationAfter giống hệt giá trị cũ trong DB', async () => {
        // Giả sử DB hiện tại đang là 7 (từ lúc setupData)
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: {
                title: 'Cập nhật hạn không đổi',
                priceStart: 4000000,
                expirationAfter: 7 // Trùng giá trị cũ -> không chạy vào if tính toán
            }
        } as any;

        await updateRentalPost(req, mockRes, next);
        if (next.mock.calls.length > 0) throw next.mock.calls[0][0];

        const response = mockRes.json.mock.calls[0][0];
        // Payload update sẽ không chứa expirationTime mới
        expect(response.statusCode).toBe(StatusCodes.OK);

        const [dbPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));

        // 1. Tính toán thời gian kỳ vọng (99 năm kể từ lúc updatedAt/createdAt)
        const expectedTime = dayjs(dbPost.updatedAt).add(7, 'day'); // Vẫn là 7 ngày vì không đổi

        // 2. Lấy thời gian thực tế từ DB
        const actualTime = dayjs(dbPost.expirationTime);

        // 3. So sánh độ lệch theo giây (second) thay vì mili-giây
        // .diff trả về giá trị chênh lệch, ta lấy trị tuyệt đối để đảm bảo khoảng cách < 2 giây
        const diffInSeconds = Math.abs(actualTime.diff(expectedTime, 'second'));

        expect(diffInSeconds).toBeLessThanOrEqual(1);

    });

    // --- NHÁNH 3: VALIDATION & SECURITY (USER/POST ID) ---

    test('TC_UNIT_QLBV_UPDATERENTAL_08: Lỗi 400 khi postId bị thiếu', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: "" },
            body: { title: 'Lỗi' }
        } as any;

        await updateRentalPost(req, mockRes, next);
        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    test('TC_UNIT_QLBV_UPDATERENTAL_09: Lỗi 404 khi postId không tồn tại', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: '999999' },
            body: { title: 'Không tìm thấy' }
        } as any;

        await updateRentalPost(req, mockRes, next);
        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    test('TC_UNIT_QLBV_UPDATERENTAL_10: Lỗi 403 khi không phải chủ bài đăng', async () => {
        const req = {
            currentUser: { users_detail: { userId: 21, role: 'landlord' } }, // Sai ID chủ
            params: { postId: POST_ID.toString() },
            body: { title: 'Hacker update' }
        } as any;

        await updateRentalPost(req, mockRes, next);
        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.FORBIDDEN);
    });

    test('TC_UNIT_QLBV_UPDATERENTAL_11: Lỗi 403 khi không phải role landlord', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'user' } }, // Sai role
            params: { postId: POST_ID.toString() },
            body: { title: 'Hacker update' }
        } as any;

        await updateRentalPost(req, mockRes, next);
        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.FORBIDDEN);
    });

    // --- NHÁNH 4: CATCH ERROR (NULL USER) ---

    test('TC_UNIT_QLBV_UPDATERENTAL_12: Phủ nhánh catch khi currentUser bị null', async () => {
        const req = {
            currentUser: null,
            params: { postId: POST_ID.toString() }
        } as any;

        await updateRentalPost(req, mockRes, next);
        expect(next).toHaveBeenCalledWith(expect.any(TypeError));
    });


    // --- NHÁNH 5: KIỂM THỬ GEOCODING (LOGIC TỌA ĐỘ) ---

    test('TC_UNIT_QLBV_UPDATERENTAL_13: Tự động lấy tọa độ từ địa chỉ khi body thiếu Long/Lat', async () => {
        // 1. Mock hàm geocoding trả về tọa độ giả lập
        const mockGeoResult = { latitude: 10.762622, longitude: 106.660172 };
        const spy = jest.spyOn(geocodingService, 'geocodingByGoong')
            .mockResolvedValue(mockGeoResult as any);

        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: {
                title: 'Test Geocoding',
                priceStart: 4000000,
                addressProvince: 'Hồ Chí Minh',
                addressDistrict: 'Quận 10',
                addressWard: 'Phường 12',
                addressDetail: 'Sư Vạn Hạnh',
            }
        } as any;

        await updateRentalPost(req, mockRes, next);

        // 2. Bóc tách dữ liệu trả về
        if (next.mock.calls.length > 0) {
            // In lỗi ra để Nhóm 6 biết đường sửa code chính
            console.error('Controller ném lỗi:', next.mock.calls[0][0]);
            throw next.mock.calls[0][0];
        }
        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(StatusCodes.OK);

        const data = response.data[0];
        // Kiểm tra xem tọa độ trong DB/Response có khớp với tọa độ mock không
        expect(data.addressLatitude).toBe(mockGeoResult.latitude);
        expect(data.addressLongitude).toBe(mockGeoResult.longitude);

        // Kiểm tra xem hàm spy có được gọi đúng địa chỉ không
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Sư Vạn Hạnh, Phường 12, Quận 10, Hồ Chí Minh'));

        spy.mockRestore(); // Dọn dẹp mock
    });

    test('TC_UNIT_QLBV_UPDATERENTAL_14: Khi Geocoding lỗi (catch), hệ thống vẫn chạy tiếp (Graceful Fail)', async () => {
        // Mock hàm geocoding ném ra lỗi (ví dụ sai API Key)
        const spy = jest.spyOn(geocodingService, 'geocodingByGoong')
            .mockRejectedValue(new Error('Goong API Error'));

        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: {
                title: 'Test Geocoding Fail',
                priceStart: 4000000,
                addressProvince: 'Hà Nội',
                addressDistrict: 'Ba Đình',
                addressWard: 'Giảng Võ',
                // Thiếu Long/Lat
            }
        } as any;

        await updateRentalPost(req, mockRes, next);
        if (next.mock.calls.length > 0) {
            // In lỗi ra để Nhóm 6 biết đường sửa code chính
            console.error('Controller ném lỗi:', next.mock.calls[0][0]);
            throw next.mock.calls[0][0];
        }

        const response = mockRes.json.mock.calls[0][0];
        // Hệ thống vẫn phải trả về 200 vì có khối .catch(() => {}) để "nuốt" lỗi
        expect(response.statusCode).toBe(StatusCodes.OK);

        const [dbPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));
        // Tọa độ lúc này sẽ là null hoặc giữ nguyên giá trị cũ tùy logic DB
        expect(dbPost.addressLatitude).toBeNull();

        spy.mockRestore();
    });

    // --- NHÁNH 7: KIỂM THỬ DỮ LIỆU "BẨN" (INVALID DATA) ---

    test('TC_UNIT_QLBV_UPDATERENTAL_15: Xử lý giá trị là CHỮ (String) - Mong đợi ép kiểu về NaN/0', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: {
                priceStart: "không phải số",
                totalArea: "năm mươi mét",
                minLeaseTerm: "một năm"
            }
        } as any;

        await updateRentalPost(req, mockRes, next);

        if (next.mock.calls.length > 0) {
            // Nếu nhóm có dùng Joi/Zod để validate trước thì sẽ nhảy vào đây
            expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.BAD_REQUEST);
        } else {
            const response = mockRes.json.mock.calls[0][0];
            const data = response.data[0];

            // Cần kiểm tra xem DB lưu gì (thường Drizzle/SQL sẽ lưu 0 hoặc null nếu gặp NaN)
            expect(Number(data.priceStart)).toBeNaN(); // Nếu API trả về NaN
            expect(Number(data.totalArea)).toBeNaN();
            const [dbDetail] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, POST_ID));
            expect(dbDetail.priceStart).toBe(5000000);

        }
    });

    test('TC_UNIT_QLBV_UPDATERENTAL_16: Xử lý SỐ ÂM (Negative Numbers)', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: {
                priceStart: -5000000, // Số âm
                totalArea: -20,
                numberRoomAvailable: -1
            }
        } as any;

        await updateRentalPost(req, mockRes, next);

        if (next.mock.calls.length > 0) throw next.mock.calls[0][0];

        // Kiểm tra DB thật: Hiện tại code của bạn chưa có logic chặn số âm, 
        // nên test này dùng để "vạch lá tìm sâu" trong báo cáo SQA
        const [updatedDetail] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, POST_ID));
        expect(updatedDetail.priceStart).toBe(0); // Nếu DB tự động chuyển NaN thành 0 hoặc có trigger chặn số âm
        expect(updatedDetail.totalArea).toBe(0);
        expect(updatedDetail.numberRoomAvailable).toBe(0);
    });

    test('TC_UNIT_QLBV_UPDATERENTAL_17: Xử lý SỐ THẬP PHÂN (Decimal/Float)', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: {
                priceStart: 5.5, // 5.5 triệu
                priceEnd: 10.7,
                totalArea: 50.55,
                minLeaseTerm: 1.5
            }
        } as any;

        await updateRentalPost(req, mockRes, next);

        if (next.mock.calls.length > 0) throw next.mock.calls[0][0];

        const response = mockRes.json.mock.calls[0][0];
        const data = response.data[0];

        // Kiểm tra độ chính xác của số thập phân
        expect(Number(data.priceStart)).toBe(5.5);
        expect(Number(data.totalArea)).toBe(50.55);

        const [dbDetail] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, POST_ID));
        expect(Number(dbDetail.priceEnd)).toBe(10.7);
    });

    // --- NHÁNH 8: KIỂM THỬ GIÁ TRỊ RỖNG (EMPTY/MISSING FIELDS) ---

    test('TC_UNIT_QLBV_UPDATERENTAL_18: Các trường số và chữ bị rỗng - Mong đợi giữ nguyên dữ liệu cũ', async () => {
        // Giả sử dữ liệu ban đầu trong DB (từ setupData) là:
        // title: 'Tiêu đề cũ', priceStart: 5000000, totalArea: 0 (hoặc null)

        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: {
                title: "",                // Chuỗi rỗng
                priceStart: null,          // Null
                priceEnd: undefined,       // Undefined
                totalArea: "",             // Chuỗi rỗng cho số
                numberRoomAvailable: null,
                minLeaseTerm: undefined
            }
        } as any;

        await updateRentalPost(req, mockRes, next);

        // Nếu hàm ném lỗi "No values to set", chúng ta sẽ bắt được ở đây
        if (next.mock.calls.length > 0) {
            console.log("Lưu ý: Hệ thống báo lỗi khi tất cả fields rỗng:", next.mock.calls[0][0].message);
            // Trong SQA, nếu đây là chủ ý thiết kế thì không sao, nếu không thì là bug.
            return;
        }

        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(StatusCodes.OK);

        // KIỂM TRA DB THẬT: Dữ liệu không được bị ghi đè thành null/0 mà phải giữ nguyên
        const [dbPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));
        const [dbDetail] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, POST_ID));

        expect(dbPost.title).toBe('Tiêu đề cũ'); // Vẫn là tiêu đề cũ vì "" bị cleanObject loại bỏ
        expect(dbDetail.priceStart).toBe(5000000); // Giữ nguyên giá cũ
    });



    describe('Unit Test: updateRentalPost - Image Upload Branch', () => {

        // --- NHÁNH 9: KIỂM THỬ UPLOAD ẢNH ---

        test('TC_UNIT_QLBV_UPDATERENTAL_19: Upload ảnh thành công và lưu vào Assets', async () => {
            // 1. Giả lập kết quả upload thành công
            const mockUploadResult = {
                success: [
                    { url: 'http://image1.jpg', publicId: 'id1' },
                    { url: 'http://image2.jpg', publicId: 'id2' }
                ],
                failed: []
            };

            const spyUpload = jest.spyOn(PostCon, 'uploadPostImageHandler')
                .mockResolvedValue(mockUploadResult as any);
            const spyInsert = jest.spyOn(PostCon, 'insertPostAssetsHandler')
                .mockResolvedValue(null as any);


            const req = {
                currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
                params: { postId: POST_ID.toString() },
                body: {
                    title: 'Test có ảnh',
                    priceStart: 5000000 // THÊM DÒNG NÀY để rental_posts không bị rỗng payload
                },
                files: [{}, {}]
            } as any;

            await updateRentalPost(req, mockRes, next);

            if (next.mock.calls.length > 0) throw next.mock.calls[0][0];

            // 2. Kiểm tra các hàm handler có được gọi đúng tham số không
            expect(spyUpload).toHaveBeenCalledWith(req);
            expect(spyInsert).toHaveBeenCalledWith(mockUploadResult.success, {
                userId: OWNER_ID,
                postId: POST_ID
            });

            const response = mockRes.json.mock.calls[0][0];
            expect(response.message).toBe('Updated post successfully!');

            spyUpload.mockRestore();
            spyInsert.mockRestore();
        });

        test('TC_UNIT_QLBV_UPDATERENTAL_20: Upload thất bại (success length = 0) - Phải ném lỗi', async () => {
            // 1. Giả lập upload không thành công file nào
            const mockUploadFail = {
                success: [],
                failed: [{ name: 'img1.png', reason: 'File too large' }]
            };

            const spyUpload = jest.spyOn(PostCon, 'uploadPostImageHandler')
                .mockResolvedValue(mockUploadFail as any);

            const req = {
                currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
                params: { postId: POST_ID.toString() },
                body: { title: 'Test upload lỗi', priceStart: 5000000 },
                files: [{}]
            } as any;

            await updateRentalPost(req, mockRes, next);

            // KIỂM TRA: next(error) phải được gọi thay vì res.status
            expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);

            const response = mockRes.json.mock.calls[0][0];
            expect(response.message).toBe('Failed to upload!');
            expect(response.data.failed.length).toBe(1);

            spyUpload.mockRestore();
        });
    });

    // --- NHÁNH 10: KIỂM THỬ KHỐI CATCH (HỆ THỐNG CRASH) ---

    test('TC_UNIT_QLBV_UPDATERENTAL_21: Phải gọi next(error) khi Database gặp sự cố bất ngờ', async () => {
        // 1. Ép hàm db.select của Drizzle ném ra một lỗi nghiêm trọng
        // Chúng ta mock hàm select để nó trả về một Promise bị reject
        const databaseError = new Error('Database Connection Lost');
        const spyDb = jest.spyOn(db, 'select').mockImplementation(() => {
            throw databaseError;
        });

        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: { title: 'Test Catch' }
        } as any;

        // 2. Chạy Controller
        await updateRentalPost(req, mockRes, next);

        // 3. Kiểm tra:
        // - res.json KHÔNG được gọi
        // - next(error) PHẢI được gọi với đúng lỗi đã giả lập
        expect(mockRes.json).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(databaseError);

        // Dọn dẹp mock để không ảnh hưởng các test case khác
        spyDb.mockRestore();
    });


    // --- NHÁNH 11: KIỂM THỬ PHÂN QUYỀN & TỒN TẠI DỮ LIỆU ---


    test('TC_UNIT_QLBV_UPDATERENTAL_22: User ID không tồn tại trong hệ thống', async () => {
        const GHOST_USER_ID = 777777;
        const req = {
            currentUser: { users_detail: { userId: GHOST_USER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: { title: 'Ghost update' }
        } as any;

        await updateRentalPost(req, mockRes, next);

        // Logic kiểm tra chủ sở hữu bài viết sẽ không tìm thấy user này
        expect(next).toHaveBeenCalled();
        const error = next.mock.calls[0][0];
        // Tùy logic nhóm: có thể trả về 401 Unauthorized hoặc 404 Not Found
        expect(error.statusCode).toBe(StatusCodes.FORBIDDEN);
    });

    test('TC_UNIT_QLBV_UPDATERENTAL_23: Cập nhật không thành công cho price với biên > 50 triệu', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            body: {
                title: 'Tiêu đề mới đã đổi',
                priceStart: 50000001, // Start lớn hơn End
                priceEnd: 50000002,
                addressProvince: 'Hà Nội',
                addressDistrict: 'Cầu Giấy',
                addressWard: 'Dịch Vọng',
                addressLongitude: 105.123, // Đã có Long/Lat nên không gọi Geocoding
                addressLatitude: 21.123
            }
        } as any;

        await updateRentalPost(req, mockRes, next);
        const response = mockRes.json.mock.calls[0][0];
        // 1. Kiểm tra mã trạng thái và message    
        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);

        // Kiểm tra DB thật sau khi update
        const [updatedPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));
        const [updatedDetail] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, POST_ID));

        expect(updatedPost.title).toBe('Tiêu đề mới đã đổi');
        // Kiểm tra logic hoán đổi giá: Start phải thành 5, End phải thành 10
        expect(updatedDetail.priceStart).not.toBe(50000001);
        expect(updatedDetail.priceEnd).not.toBe(50000002);
        expect(mockRes.json).toHaveBeenCalled();
    });

});