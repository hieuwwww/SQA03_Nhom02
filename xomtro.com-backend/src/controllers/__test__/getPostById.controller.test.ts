import { StatusCodes } from 'http-status-codes';
import { getPostById } from '../post.controller';
import { db } from '@/configs/database.config';
import { posts, rentalPosts } from '@/models/schema';
import { eq } from 'drizzle-orm';

describe('Unit Test: getPostById', () => {
    let mockRes: any;
    let next: any;

    // Data mẫu để so sánh
    const DUMMY_POST = {
        id: 8888,
        title: 'Phòng trọ Nhóm 6 Test Coverage',
        type: 'rental',
        status: 'actived',
        addressProvince: 'Hà Nội',
        addressDistrict: 'Hai Bà Trưng',
        addressWard: 'Phố Huế',
        ownerId: 21
    };

    const DUMMY_RENTAL = {
        postId: 8888,
        priceStart: 1000000,
        priceEnd: 2000000,
        totalArea: 20,
        minLeaseTerm: 6,
        minLeaseTermUnit: 'month',
        hasFurniture: true,
        allowPets: false
    };

    beforeEach(async () => {
        // Reset mocks
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
        next = jest.fn();

        // CLEAN & SEED: Tạo mới trước mỗi test
        await db.delete(rentalPosts).where(eq(rentalPosts.postId, DUMMY_POST.id));
        await db.delete(posts).where(eq(posts.id, DUMMY_POST.id));

        await db.insert(posts).values(DUMMY_POST);
        await db.insert(rentalPosts).values(DUMMY_RENTAL);
    });

    afterEach(async () => {
        // DELETE: Xóa ngay sau khi test xong
        await db.delete(rentalPosts).where(eq(rentalPosts.postId, DUMMY_POST.id));
        await db.delete(posts).where(eq(posts.id, DUMMY_POST.id));
    });

    test('TC_UNIT_QLBV_GETPOST_1: Phủ nhánh thành công và khớp dữ liệu Rental', async () => {
        const req = { params: { postId: DUMMY_POST.id } } as any;

        await getPostById(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];

        // 1. Check nhánh thành công (200 OK)
        expect(response.statusCode).toBe(StatusCodes.OK);

        // 2. CHECK KHỚP DỮ LIỆU: So sánh kết quả trả về với DUMMY_POST ban đầu
        const returnedData = response.data[0];
        expect(returnedData.post.title).toBe(DUMMY_POST.title);
        expect(returnedData.post.type).toBe('rental');

        // 3. Check khớp dữ liệu Detail (Rental table)
        expect(Number(returnedData.detail.priceStart)).toBe(DUMMY_RENTAL.priceStart);
        expect(returnedData.detail.priceEnd).toBe(DUMMY_RENTAL.priceEnd);
        expect(returnedData.detail.totalArea).toBe(DUMMY_RENTAL.totalArea);
        expect(returnedData.detail.minLeaseTerm).toBe(DUMMY_RENTAL.minLeaseTerm);
        expect(returnedData.detail.minLeaseTermUnit).toBe(DUMMY_RENTAL.minLeaseTermUnit);
        expect(returnedData.detail.hasFurniture).toBe(DUMMY_RENTAL.hasFurniture);
        expect(returnedData.detail.allowPets).toBe(DUMMY_RENTAL.allowPets);
    });

    test('TC_UNIT_QLBV_GETPOST_2: Phủ nhánh NOT_FOUND khi Post không tồn tại', async () => {
        const req = { params: { postId: '999999' } } as any;

        await getPostById(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    test('TC_UNIT_QLBV_GETPOST_3: Phủ nhánh NOT_FOUND khi có Post nhưng mất Detail (Orphan Data)', async () => {
        // Xóa phần detail đi để tạo lỗi mồ côi
        await db.delete(rentalPosts).where(eq(rentalPosts.postId, DUMMY_POST.id));

        const req = { params: { postId: DUMMY_POST.id } } as any;

        await getPostById(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    test('TC_UNIT_QLBV_GETPOST_4: Phủ nhánh BAD_REQUEST khi thiếu params postId', async () => {
        const req = { params: { postId: "" } } as any;

        await getPostById(req, mockRes, next);

        expect(next).toHaveBeenCalledWith(expect.any(Object));
        const error = next.mock.calls[0][0];
        expect(error.statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    test('TC_UNIT_QLBV_GETPOST_5: postId là chuỗi ký tự (NaN)', async () => {
        const req = {
            params: { postId: 'not-a-number' }
        } as any;

        await getPostById(req, mockRes, next);

        // KẾT QUẢ MONG ĐỢI:
        // Vì Number('not-a-number') là NaN, khi gọi selectPostById(NaN), 
        // DB hoặc Service sẽ quăng lỗi. Code sẽ nhảy vào catch (error) { next(error) }.
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    test('TC_UNIT_QLBV_GETPOST_6: postId là số âm', async () => {
        const req = {
            params: { postId: '-99' }
        } as any;

        await getPostById(req, mockRes, next);

        // KẾT QUẢ MONG ĐỢI:
        // getPostResult.length sẽ là 0 -> Trả về 404 NOT FOUND
        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    test('TC_UNIT_QLBV_GETPOST_7: postId là số thực', async () => {
        const req = {
            params: { postId: '10.5' }
        } as any;

        await getPostById(req, mockRes, next);

        // KẾT QUẢ MONG ĐỢI:
        // Thường ID là Integer, nên 10.5 sẽ không khớp với bất kỳ bản ghi nào
        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
    });


    test('TC_UNIT_QLBV_GETPOST_8: Bài viết có sự thay đổi trạng thái sang hidden', async () => {
        await db.update(posts).set({ status: 'hidden' }).where(eq(posts.id, DUMMY_POST.id));

        const req = { params: { postId: DUMMY_POST.id } } as any;
        await getPostById(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];
        // KẾT QUẢ MONG ĐỢI:
        // Nếu code của bạn đã xử lý nhánh hidden, nó có thể trả về 404 NOT FOUND hoặc một phản hồi đặc biệt khác.
        // Dù sao thì bài viết hidden cũng không được trả về như bình thường, nên 404 là hợp lý.
        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    test('TC_UNIT_QLBV_GETPOST_9: Bài viết có sự thay đổi trạng thái sang unactived', async () => {
        await db.update(posts).set({ status: 'unactived' }).where(eq(posts.id, DUMMY_POST.id));

        const req = { params: { postId: DUMMY_POST.id } } as any;
        await getPostById(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];
        // KẾT QUẢ MONG ĐỢI:
        // Nếu code của bạn đã xử lý nhánh unactived, nó có thể trả về 404 NOT FOUND hoặc một phản hồi đặc biệt khác.
        // Dù sao thì bài viết hidden cũng không được trả về như bình thường, nên 404 là hợp lý.
        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

});