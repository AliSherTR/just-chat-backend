import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, IsStrongPassword } from "class-validator";

export class SignUpDto {
    @ApiProperty({example: "user@example.com" , description: "User's Email Address"} )
    @IsEmail({}, { message: 'Invalid email format' })
    email: string;

    @ApiProperty({example: "John Doe" , description: "User's Full Name"} )
    @IsString({ message: "Name must only contain letters" })
    name: string

    @ApiProperty({example: "A very strong password" , description: "Password"} )
    @IsStrongPassword({} , { message: 'Password must be strong' })
    password: string;
}